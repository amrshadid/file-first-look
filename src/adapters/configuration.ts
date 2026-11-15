import * as vscode from 'vscode';

/** Typed view of the `fileFirstLook.*` settings. */
export interface Settings {
  readonly exclude: readonly string[];
  readonly respectGitIgnore: boolean;
  readonly minimumViewTime: number;
}

export const SECTION = 'fileFirstLook';

/** Reads settings for the folder, falling back to safe values if a user setting is malformed. */
export function readSettings(folder: vscode.WorkspaceFolder): Settings {
  const config = vscode.workspace.getConfiguration(SECTION, folder.uri);
  const exclude = config.get<unknown>('exclude');
  const minimumViewTime = config.get<unknown>('minimumViewTime');
  const respectGitIgnore = config.get<unknown>('respectGitIgnore');

  return {
    exclude: Array.isArray(exclude)
      ? exclude.filter((g): g is string => typeof g === 'string')
      : [],
    respectGitIgnore: respectGitIgnore !== false,
    minimumViewTime:
      typeof minimumViewTime === 'number' && Number.isFinite(minimumViewTime)
        ? Math.min(Math.max(0, minimumViewTime), 10_000)
        : 1000,
  };
}
