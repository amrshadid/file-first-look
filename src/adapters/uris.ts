import * as path from 'node:path';

import type * as vscode from 'vscode';

import { toRelPath, type RelPath } from '../core';

/**
 * Maps a URI to a workspace-relative path, or `undefined` when the URI is not a
 * local file inside the tracked folder (untitled docs, output panes, git: URIs,
 * files elsewhere on disk…).
 */
export function relPathOf(
  folder: vscode.WorkspaceFolder,
  uri: vscode.Uri | undefined,
): RelPath | undefined {
  if (uri?.scheme !== 'file') {
    return undefined;
  }
  const relative = path.relative(folder.uri.fsPath, uri.fsPath);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    return undefined;
  }
  return toRelPath(relative);
}
