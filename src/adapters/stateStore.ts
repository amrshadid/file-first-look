import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

import {
  deserialize,
  serialize,
  serializeBaseline,
  type DeserializeResult,
  type RelPath,
  type TrackingState,
} from '../core';

const STATE_FILE = 'state.json';
const BASELINE_FILE = 'baseline.json';
const SCOPE_FILE = 'scope.json';
const SAVE_DEBOUNCE_MS = 250;

/**
 * Persists tracking state as JSON files in VS Code's private per-workspace
 * storage folder (`ExtensionContext.storageUri`). Nothing is ever written into
 * the user's repository.
 *
 * Files rather than `workspaceState`, because:
 * - `workspaceState` is buffered and flushed to disk only periodically or on a
 *   clean shutdown, so a crash or force-quit could lose recent changes;
 * - the baseline can hold 100k+ paths, which suits a plain file.
 *
 * Writes are crash-safe (temp file, then rename), debounced so a burst of agent
 * files becomes one write, and chained so they can never land out of order. The
 * baseline has its own file and is rewritten only when the set changed (the
 * core keeps its identity otherwise).
 */
export class StateStore {
  private latest: TrackingState | undefined;
  private lastBaseline: ReadonlySet<RelPath> | undefined;
  private timer: NodeJS.Timeout | undefined;
  private writes: Promise<void> = Promise.resolve();

  /**
   * @param dir folder for the state files, from `context.storageUri.fsPath`
   * @param onError reports a failed write without breaking later writes
   */
  constructor(
    private readonly dir: string,
    private readonly onError: (error: unknown) => void,
  ) {}

  async load(): Promise<DeserializeResult> {
    let result: DeserializeResult;
    try {
      const [record, baseline] = await Promise.all([
        readJson(path.join(this.dir, STATE_FILE)),
        readJson(path.join(this.dir, BASELINE_FILE)),
      ]);
      result = deserialize(record, baseline);
    } catch (error) {
      result = deserialize(undefined, undefined);
      result = { ...result, problem: `stored state is unreadable: ${String(error)}` };
    }
    this.lastBaseline = result.state.baseline;
    return result;
  }

  /** Schedules a debounced write of `state`. */
  save(state: TrackingState): void {
    this.latest = state;
    this.timer ??= setTimeout(() => {
      void this.flush();
    }, SAVE_DEBOUNCE_MS);
  }

  /** Writes any pending state immediately. Resolves once it is on disk. */
  flush(): Promise<void> {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    const state = this.latest;
    if (state === undefined) {
      return this.writes;
    }
    this.latest = undefined;

    const baselineChanged = state.baseline !== this.lastBaseline;
    // Assume success; reset below if the write fails so the next save retries it.
    this.lastBaseline = state.baseline;
    // Serialize now, synchronously, so the snapshot matches `state` exactly.
    const record = state.tracking ? serialize(state) : undefined;
    const baseline = state.tracking && baselineChanged ? serializeBaseline(state) : undefined;

    this.writes = this.writes
      .then(async () => {
        if (record === undefined) {
          await Promise.all([this.remove(STATE_FILE), this.remove(BASELINE_FILE)]);
          return;
        }
        await mkdir(this.dir, { recursive: true });
        // Baseline first: a crash between the two writes leaves a newer
        // baseline with an older record, which reconcile repairs on next start.
        if (baseline !== undefined) {
          await this.writeAtomic(BASELINE_FILE, baseline);
        }
        await this.writeAtomic(STATE_FILE, record);
      })
      .catch((error: unknown) => {
        this.lastBaseline = undefined;
        this.onError(error);
      });
    return this.writes;
  }

  /**
   * The scope (exclusions, git ignore on/off) the stored baseline was taken
   * with. If it differs at the next start, the extension rescans with
   * "scope changed" semantics so old files never flood the list.
   */
  async readScope(): Promise<string | undefined> {
    try {
      const value = await readJson(path.join(this.dir, SCOPE_FILE));
      return typeof value === 'string' ? value : undefined;
    } catch {
      return undefined;
    }
  }

  writeScope(scope: string): Promise<void> {
    this.writes = this.writes
      .then(async () => {
        await mkdir(this.dir, { recursive: true });
        await this.writeAtomic(SCOPE_FILE, scope);
      })
      .catch(this.onError);
    return this.writes;
  }

  private async writeAtomic(name: string, value: unknown): Promise<void> {
    const target = path.join(this.dir, name);
    const temp = `${target}.tmp`;
    await writeFile(temp, JSON.stringify(value), 'utf8');
    await rename(temp, target);
  }

  private remove(name: string): Promise<void> {
    return rm(path.join(this.dir, name), { force: true });
  }
}

/** Reads and parses a JSON file. A missing file is `undefined`, not an error. */
async function readJson(file: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if (isNotFound(error)) {
      return undefined;
    }
    throw error;
  }
  return JSON.parse(text) as unknown;
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
