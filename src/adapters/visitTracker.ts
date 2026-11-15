import * as vscode from 'vscode';

import type { PathFilter, RelPath } from '../core';
import { relPathOf } from './uris';

/**
 * Detects when a human has plausibly *looked at* a file (ADR 0003, HCD: honest signals).
 *
 * The active tab, not the active text editor, is the source of truth:
 * - In a diff editor the modified side is a real `file:` document, so
 *   `activeTextEditor` alone would count diff views as opens. Diff tabs have
 *   a `TabInputTextDiff` input and are ignored.
 * - Images and other custom editors never become a text editor but do have a
 *   tab input with a URI.
 *
 * A visit counts only after the tab stays active for `minimumViewTime` ms while
 * the window is focused. Rapid tab cycling and extensions that auto-open files
 * therefore do not clear entries the user never actually saw.
 */
export class VisitTracker implements vscode.Disposable {
  private candidate: RelPath | undefined;
  private timer: NodeJS.Timeout | undefined;
  private readonly subscriptions: vscode.Disposable[];

  constructor(
    private readonly folder: vscode.WorkspaceFolder,
    private readonly getFilter: () => PathFilter,
    private readonly getMinimumViewTime: () => number,
    private readonly onVisit: (path: RelPath) => void,
    /** Injected so integration tests can run in a window that never gains OS focus. */
    private readonly isFocused: () => boolean = () => vscode.window.state.focused,
  ) {
    const evaluate = (): void => {
      this.evaluate();
    };
    this.subscriptions = [
      vscode.window.tabGroups.onDidChangeTabs(evaluate),
      vscode.window.tabGroups.onDidChangeTabGroups(evaluate),
      vscode.window.onDidChangeActiveTextEditor(evaluate),
      vscode.window.onDidChangeWindowState(evaluate),
    ];
    // The file that is already active at activation counts too.
    this.evaluate();
  }

  /** Re-checks the active tab, e.g. after the exclusion settings changed. */
  evaluate(): void {
    const next = this.isFocused() ? this.activePath() : undefined;
    if (next === this.candidate) {
      return; // Same file still in view: let the running timer finish.
    }
    this.clearTimer();
    this.candidate = next;
    if (next === undefined) {
      return;
    }

    const delay = this.getMinimumViewTime();
    if (delay === 0) {
      this.onVisit(next);
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      // Re-check: the tab or focus may have changed without an event we observed.
      if (this.isFocused() && this.activePath() === next) {
        this.onVisit(next);
      }
    }, delay);
  }

  private activePath(): RelPath | undefined {
    const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
    const uri =
      input instanceof vscode.TabInputText ||
      input instanceof vscode.TabInputCustom ||
      input instanceof vscode.TabInputNotebook
        ? input.uri
        : undefined;
    const rel = relPathOf(this.folder, uri);
    return rel !== undefined && this.getFilter().isIncluded(rel) ? rel : undefined;
  }

  private clearTimer(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  dispose(): void {
    this.clearTimer();
    vscode.Disposable.from(...this.subscriptions).dispose();
  }
}
