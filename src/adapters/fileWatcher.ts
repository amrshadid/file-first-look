import * as vscode from 'vscode';

import type { LiveEvent, PathFilter, RelPath } from '../core';
import type { GitIgnore } from './gitIgnore';
import { relPathOf } from './uris';
import type { Scanner } from './workspaceScanner';

/**
 * Created files are collected briefly and checked against git ignore rules in
 * one batch, so an agent writing hundreds of files spawns one git process,
 * not hundreds.
 */
const CREATE_BATCH_MS = 100;

/**
 * Deletes wait this long before being trusted. Many editors and agent tools
 * save by writing a temp file and renaming it over the original, which can
 * surface as delete + create. Deletes are also batched, so `rm -rf dist` becomes
 * one core event instead of thousands.
 */
const DELETE_BATCH_MS = 300;

/** Ignore-rule edits are debounced so saving several files triggers one rescan. */
const IGNORE_RULES_DEBOUNCE_MS = 500;

/** Upper bound on concurrent `stat` calls while confirming a batch. */
const STAT_CONCURRENCY = 64;

/** Callbacks the watcher reports to. */
export interface FileWatcherSink {
  readonly dispatch: (event: LiveEvent) => unknown;
  /** A `.gitignore` or `.git/info/exclude` changed, so the scope must be rescanned. */
  readonly ignoreRulesChanged: () => void;
  readonly onError: (error: unknown) => void;
}

/**
 * Turns file-system events into core events.
 *
 * A `FileSystemWatcher` is required because `workspace.onDidCreateFiles` does not
 * fire for files written by other applications (agent CLIs) or via `workspace.fs`.
 * See https://code.visualstudio.com/api/references/vscode-api#workspace.onDidCreateFiles
 *
 * Watcher events are folded on bulk operations and honour `files.watcherExclude`,
 * so they are a fast path only. The tracker's reconcile scan is the safety net.
 */
export class FileWatcher implements vscode.Disposable {
  private readonly createBatch = new Set<RelPath>();
  private readonly deleteBatch = new Set<RelPath>();
  private createTimer: NodeJS.Timeout | undefined;
  private deleteTimer: NodeJS.Timeout | undefined;
  private ignoreRulesTimer: NodeJS.Timeout | undefined;
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(
    private readonly folder: vscode.WorkspaceFolder,
    private readonly getFilter: () => PathFilter,
    private readonly scan: Scanner,
    private readonly getGit: () => GitIgnore | undefined,
    private readonly sink: FileWatcherSink,
  ) {
    // Content changes are irrelevant: "opened once" is the only signal we track.
    const files = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(folder, '**/*'),
      false,
      true,
      false,
    );
    this.subscriptions.push(
      files,
      files.onDidCreate((uri) => {
        this.handleCreate(uri).catch(sink.onError);
      }),
      files.onDidDelete((uri) => {
        this.handleDelete(uri);
      }),
    );

    // Ignore rules are the exception: their *content* changes the scope.
    for (const glob of ['**/.gitignore', '.git/info/exclude']) {
      const rules = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, glob),
      );
      const changed = (): void => {
        this.scheduleIgnoreRulesChanged();
      };
      this.subscriptions.push(
        rules,
        rules.onDidCreate(changed),
        rules.onDidChange(changed),
        rules.onDidDelete(changed),
      );
    }
  }

  private async handleCreate(uri: vscode.Uri): Promise<void> {
    const rel = relPathOf(this.folder, uri);
    if (rel === undefined || !this.getFilter().isIncluded(rel)) {
      return;
    }
    this.deleteBatch.delete(rel);

    const type = await statType(uri);
    if (type === undefined) {
      return; // Already gone again (e.g. a temp file).
    }
    if (type & vscode.FileType.Directory) {
      // A folder moved in from elsewhere may arrive as a single event.
      for (const path of await this.scan(rel)) {
        this.sink.dispatch({ type: 'created', path });
      }
    } else if (type & vscode.FileType.File) {
      this.createBatch.add(rel);
      this.createTimer ??= setTimeout(() => {
        this.createTimer = undefined;
        this.flushCreates().catch(this.sink.onError);
      }, CREATE_BATCH_MS);
    }
  }

  private async flushCreates(): Promise<void> {
    const batch = [...this.createBatch];
    this.createBatch.clear();

    let visible = batch;
    const git = this.getGit();
    if (git) {
      try {
        visible = await git.withoutIgnored(batch);
      } catch (error) {
        // Fail open: listing an ignored file is a minor annoyance, silently
        // missing a new file defeats the purpose. Reconcile tidies up later.
        this.sink.onError(error);
      }
    }

    // The git check takes time: a temp file may already be gone. Listing it
    // would leave a row for a file that doesn't exist.
    const stillThere = await filterAsync(visible, async (path) => {
      return (await statType(this.uriOf(path))) !== undefined;
    });
    for (const path of stillThere) {
      this.sink.dispatch({ type: 'created', path });
    }
  }

  private handleDelete(uri: vscode.Uri): void {
    const rel = relPathOf(this.folder, uri);
    // Excluded paths are never tracked, so their deletes (`npm ci` wiping
    // node_modules) can be dropped right away.
    if (rel === undefined || !this.getFilter().isIncluded(rel)) {
      return;
    }
    this.createBatch.delete(rel);
    this.deleteBatch.add(rel);
    this.deleteTimer ??= setTimeout(() => {
      this.deleteTimer = undefined;
      this.flushDeletes().catch(this.sink.onError);
    }, DELETE_BATCH_MS);
  }

  private async flushDeletes(): Promise<void> {
    const batch = [...this.deleteBatch];
    this.deleteBatch.clear();
    // Only trust deletes for paths that are really gone (save-by-replace).
    const gone = await filterAsync(batch, async (path) => {
      return (await statType(this.uriOf(path))) === undefined;
    });
    if (gone.length > 0) {
      this.sink.dispatch({ type: 'deleted', paths: gone });
    }
  }

  private scheduleIgnoreRulesChanged(): void {
    if (this.ignoreRulesTimer !== undefined) {
      clearTimeout(this.ignoreRulesTimer);
    }
    this.ignoreRulesTimer = setTimeout(() => {
      this.ignoreRulesTimer = undefined;
      this.sink.ignoreRulesChanged();
    }, IGNORE_RULES_DEBOUNCE_MS);
  }

  private uriOf(path: RelPath): vscode.Uri {
    return vscode.Uri.joinPath(this.folder.uri, path);
  }

  dispose(): void {
    for (const timer of [this.createTimer, this.deleteTimer, this.ignoreRulesTimer]) {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
    vscode.Disposable.from(...this.subscriptions).dispose();
  }
}

async function statType(uri: vscode.Uri): Promise<vscode.FileType | undefined> {
  try {
    return (await vscode.workspace.fs.stat(uri)).type;
  } catch {
    return undefined;
  }
}

/** `Array.filter` with an async predicate and bounded concurrency. */
async function filterAsync<T>(
  items: readonly T[],
  predicate: (item: T) => Promise<boolean>,
): Promise<T[]> {
  const keep: T[] = [];
  for (let start = 0; start < items.length; start += STAT_CONCURRENCY) {
    const chunk = items.slice(start, start + STAT_CONCURRENCY);
    const results = await Promise.all(chunk.map(predicate));
    chunk.forEach((item, index) => {
      if (results[index]) {
        keep.push(item);
      }
    });
  }
  return keep;
}
