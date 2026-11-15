import * as path from 'node:path';

import * as vscode from 'vscode';

import type { RelPath, TrackingState } from '../core';

export const VIEW_ID = 'fileFirstLook.unopenedFiles';
export const OPEN_COMMAND = 'fileFirstLook.openFile';

/**
 * The "Unopened Files" view: a flat, sorted list of pending paths.
 *
 * Each row shows the file name with its folder as the description, uses the
 * user's file icon theme via `resourceUri`, and opens the file on click. The
 * view badge and description show the count, so progress is visible even
 * when the view is collapsed.
 */
export class UnopenedFilesView implements vscode.TreeDataProvider<RelPath>, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<undefined>();
  readonly onDidChangeTreeData = this.changeEmitter.event;

  private readonly treeView: vscode.TreeView<RelPath>;
  private items: readonly RelPath[] = [];

  constructor(private readonly folder: vscode.WorkspaceFolder | undefined) {
    this.treeView = vscode.window.createTreeView(VIEW_ID, {
      treeDataProvider: this,
      showCollapseAll: false,
    });
  }

  /** Re-renders from the latest state. */
  update(state: TrackingState): void {
    this.items = [...state.pending].sort((a, b) => a.localeCompare(b));
    const pending = state.pending.size;

    this.treeView.badge =
      pending > 0
        ? { value: pending, tooltip: `${pending} new ${plural(pending, 'file')} not opened yet` }
        : undefined;
    this.treeView.description = state.tracking && pending > 0 ? `${pending} unopened` : '';
    this.changeEmitter.fire(undefined);
  }

  getChildren(element?: RelPath): RelPath[] {
    // Flat list: only the root has children. Empty lists show the welcome content.
    return element === undefined && this.folder !== undefined ? [...this.items] : [];
  }

  getTreeItem(rel: RelPath): vscode.TreeItem {
    if (this.folder === undefined) {
      return new vscode.TreeItem(rel);
    }
    const uri = vscode.Uri.joinPath(this.folder.uri, rel);
    const item = new vscode.TreeItem(uri, vscode.TreeItemCollapsibleState.None);
    item.id = rel;
    item.label = path.posix.basename(rel);
    const dir = path.posix.dirname(rel);
    item.description = dir === '.' ? '' : dir;
    item.tooltip = rel;
    item.contextValue = 'unopenedFile';
    item.command = { command: OPEN_COMMAND, title: 'Open File', arguments: [rel] };
    return item;
  }

  dispose(): void {
    this.treeView.dispose();
    this.changeEmitter.dispose();
  }
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}
