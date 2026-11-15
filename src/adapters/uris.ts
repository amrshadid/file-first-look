import * as path from 'node:path';

import type * as vscode from 'vscode';

import { toRelPath, type RelPath } from '../core';

/**
 * macOS file systems are normalization-insensitive: the same file name can
 * reach us as NFC from git (`core.precomposeUnicode`) and as NFD from other
 * APIs. Normalizing to NFC on macOS makes both spellings one path, so a visit
 * always matches its row. Other platforms treat names as exact bytes, so we
 * leave them untouched.
 */
export function canonicalPath(rel: RelPath, platform: NodeJS.Platform = process.platform): RelPath {
  return platform === 'darwin' ? rel.normalize('NFC') : rel;
}

/**
 * Maps a URI to a workspace-relative path, or `undefined` when the URI is not a
 * local file inside the tracked folder (untitled docs, output panes, git: URIs,
 * files elsewhere on disk…).
 */
export function relPathOf(
  folder: Pick<vscode.WorkspaceFolder, 'uri'>,
  uri: Pick<vscode.Uri, 'scheme' | 'fsPath'> | undefined,
  pathApi: Pick<typeof path, 'relative' | 'isAbsolute' | 'sep'> = path,
): RelPath | undefined {
  if (uri?.scheme !== 'file') {
    return undefined;
  }
  const relative = pathApi.relative(folder.uri.fsPath, uri.fsPath);
  // Compare whole segments: a file literally named `..notes` is inside the folder.
  const outside =
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${pathApi.sep}`) ||
    pathApi.isAbsolute(relative);
  if (outside) {
    return undefined;
  }
  // Only the platform separator is a separator: on POSIX a backslash is part of a name.
  const posix = pathApi.sep === '/' ? relative : relative.split(pathApi.sep).join('/');
  return canonicalPath(toRelPath(posix));
}
