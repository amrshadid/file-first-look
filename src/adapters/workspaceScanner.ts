import * as vscode from 'vscode';

import type { PathFilter, RelPath } from '../core';
import type { GitIgnore } from './gitIgnore';
import { relPathOf } from './uris';

/** Lists eligible files under `subdir` (or the whole folder). */
export type Scanner = (subdir?: RelPath) => Promise<RelPath[]>;

/**
 * Creates the scanner used for the baseline, reconcile and folder expansion.
 *
 * - With git (and `respectGitIgnore` on): `git ls-files`, which honours every
 *   ignore rule and never walks ignored trees.
 * - Otherwise: `workspace.findFiles`, with the exclusions passed through so
 *   excluded trees are not walked. An explicit exclude also stops
 *   `files.exclude` from silently changing what is tracked.
 *
 * Either way, every result is re-checked with the core filter so scans and live
 * events share one source of truth (ADR 0004).
 */
export function createScanner(
  folder: vscode.WorkspaceFolder,
  getFilter: () => PathFilter,
  getGit: () => GitIgnore | undefined,
): Scanner {
  return async (subdir) => {
    const filter = getFilter();
    const git = getGit();
    const candidates = git ? await git.listFiles(subdir) : await findFiles(folder, filter, subdir);
    return candidates.filter((path) => filter.isIncluded(path));
  };
}

async function findFiles(
  folder: vscode.WorkspaceFolder,
  filter: PathFilter,
  subdir: RelPath | undefined,
): Promise<RelPath[]> {
  const base = subdir === undefined ? folder.uri : vscode.Uri.joinPath(folder.uri, subdir);
  const uris = await vscode.workspace.findFiles(
    new vscode.RelativePattern(base, '**/*'),
    // `null` disables default excludes; we want exactly the user's list.
    filter.combinedExcludeGlob === undefined
      ? null
      : new vscode.RelativePattern(folder, filter.combinedExcludeGlob),
  );
  const paths: RelPath[] = [];
  for (const uri of uris) {
    const rel = relPathOf(folder, uri);
    if (rel !== undefined) {
      paths.push(rel);
    }
  }
  return paths;
}
