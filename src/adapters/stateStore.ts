import type * as vscode from 'vscode';

import {
  deserialize,
  serialize,
  serializeBaseline,
  type DeserializeResult,
  type RelPath,
  type TrackingState,
} from '../core';

const STATE_KEY = 'fileFirstLook.state';
const BASELINE_KEY = 'fileFirstLook.baseline';
const SAVE_DEBOUNCE_MS = 250;

/**
 * Persists tracking state in `ExtensionContext.workspaceState`.
 *
 * - Bursts of events (an agent writing 40 files) collapse into one write.
 * - Writes are chained so they can never land out of order.
 * - The baseline is stored under its own key and rewritten only when the set
 *   actually changed (the core keeps its identity otherwise), so large
 *   repositories don't pay for re-serializing 100k paths on every new file.
 *
 * Nothing is written into the user's repository: state stays in VS Code's own storage.
 */
export class StateStore implements vscode.Disposable {
  private latest: TrackingState | undefined;
  private lastBaseline: ReadonlySet<RelPath> | undefined;
  private timer: NodeJS.Timeout | undefined;
  private writes: Promise<void> = Promise.resolve();

  constructor(private readonly memento: vscode.Memento) {}

  load(): DeserializeResult {
    const result = deserialize(
      this.memento.get<unknown>(STATE_KEY),
      this.memento.get<unknown>(BASELINE_KEY),
    );
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

  /** Writes any pending state immediately. Resolves once it is stored. */
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

    const record = state.tracking ? serialize(state) : undefined;
    const baselineChanged = state.baseline !== this.lastBaseline;
    const baseline = state.tracking && baselineChanged ? serializeBaseline(state) : undefined;
    this.lastBaseline = state.baseline;

    this.writes = this.writes.then(async () => {
      if (!state.tracking) {
        await this.memento.update(BASELINE_KEY, undefined);
      } else if (baseline !== undefined) {
        await this.memento.update(BASELINE_KEY, baseline);
      }
      await this.memento.update(STATE_KEY, record);
    });
    return this.writes;
  }

  dispose(): void {
    void this.flush();
  }
}
