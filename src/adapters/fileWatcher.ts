import * as vscode from 'vscode';

import type { LiveEvent, PathFilter, RelPath } from '../core';
import type { GitIgnore } from './gitIgnore';
import { relPathOf } from './uris';
import type { Scanner } from './workspaceScanner';

/**
 * How long to wait before trusting a delete. Many editors and agent tools save
 * by writing a temp file and renaming it over the original, which can surface
 * as delete + create. Confirming the file is really gone avoids re-listing a
 * file the user already opened.
 */
const DELETE_CONFIRM_MS = 300;

/**
 * Created files are collected briefly and checked against git ignore rules in
 * one batch, so an agent writing hundreds of files spawns one git process,
 * not hundreds.
 */
const CREATE_BATCH_MS = 100;

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
  private readonly watcher: vscode.FileSystemWatcher;
  private readonly pendingDeletes = new Map<RelPath, NodeJS.Timeout>();
  private readonly createBatch = new Set<RelPath>();
  private createTimer: NodeJS.Timeout | undefined;
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor(
    private readonly folder: vscode.WorkspaceFolder,
    private readonly getFilter: () => PathFilter,
    private readonly scan: Scanner,
    private readonly getGit: () => GitIgnore | undefined,
    private readonly dispatch: (event: LiveEvent) => unknown,
    private readonly onError: (error: unknown) => void,
  ) {
    // Content changes are irrelevant: "opened once" is the only signal we track.
    this.watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(folder, '**/*'),
      false,
      true,
      false,
    );
    this.subscriptions.push(
      this.watcher,
      this.watcher.onDidCreate((uri) => {
        this.handleCreate(uri).catch(onError);
      }),
      this.watcher.onDidDelete((uri) => {
        this.handleDelete(uri);
      }),
    );
  }

  private async handleCreate(uri: vscode.Uri): Promise<void> {
    const rel = relPathOf(this.folder, uri);
    if (rel === undefined || !this.getFilter().isIncluded(rel)) {
      return;
    }
    this.cancelDelete(rel);

    const type = await statType(uri);
    if (type === undefined) {
      return; // Already gone again (e.g. a temp file).
    }
    if (type & vscode.FileType.Directory) {
      // A folder moved in from elsewhere may arrive as a single event.
      for (const path of await this.scan(rel)) {
        this.dispatch({ type: 'created', path });
      }
    } else if (type & vscode.FileType.File) {
      this.queueCreate(rel);
    }
  }

  private queueCreate(rel: RelPath): void {
    this.createBatch.add(rel);
    this.createTimer ??= setTimeout(() => {
      this.createTimer = undefined;
      this.flushCreates().catch(this.onError);
    }, CREATE_BATCH_MS);
  }

  private async flushCreates(): Promise<void> {
    const batch = [...this.createBatch];
    this.createBatch.clear();
    const git = this.getGit();
    const visible = git ? await git.withoutIgnored(batch) : batch;
    for (const path of visible) {
      this.dispatch({ type: 'created', path });
    }
  }

  private handleDelete(uri: vscode.Uri): void {
    const rel = relPathOf(this.folder, uri);
    if (rel === undefined) {
      return;
    }
    this.cancelDelete(rel);
    this.pendingDeletes.set(
      rel,
      setTimeout(() => {
        this.pendingDeletes.delete(rel);
        statType(uri)
          .then((type) => {
            if (type === undefined) {
              this.dispatch({ type: 'deleted', path: rel });
            }
          })
          .catch(this.onError);
      }, DELETE_CONFIRM_MS),
    );
  }

  private cancelDelete(rel: RelPath): void {
    const timer = this.pendingDeletes.get(rel);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.pendingDeletes.delete(rel);
    }
  }

  dispose(): void {
    if (this.createTimer !== undefined) {
      clearTimeout(this.createTimer);
    }
    for (const timer of this.pendingDeletes.values()) {
      clearTimeout(timer);
    }
    this.pendingDeletes.clear();
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
