import { execFile } from 'node:child_process';
import { access } from 'node:fs/promises';
import * as path from 'node:path';

import type { RelPath } from '../core';
import { canonicalPath } from './uris';

/** Generous cap: `ls-files -z` on a 500k-file repository is ~30 MB. */
const MAX_BUFFER = 256 * 1024 * 1024;

/**
 * Settings forced on every git call. A repository's own config can name
 * programs that git runs while reading the index (`core.fsmonitor`), so a
 * cloned repo could otherwise execute code just by being opened. We also never
 * run git in untrusted workspaces (see `extension.ts`); this is defence in depth.
 */
const SAFE_CONFIG = ['-c', 'core.fsmonitor=false', '-c', 'core.untrackedCache=false'];

/**
 * Asks git which files are ignored (ADR 0005).
 *
 * Git is the only complete source of truth for ignore rules: nested
 * `.gitignore` files, `.git/info/exclude`, the global excludes file and
 * negations. Reimplementing them would be a long tail of bugs. On large
 * repositories `git ls-files` is also much faster than walking the tree,
 * because ignored folders such as `node_modules` are skipped entirely.
 */
export class GitIgnore {
  private constructor(
    private readonly git: string,
    private readonly cwd: string,
  ) {}

  /** Returns a helper when `cwd` is inside a git work tree and git is installed. */
  static async detect(cwd: string): Promise<GitIgnore | undefined> {
    const git = await resolveGitExecutable();
    if (git === undefined) {
      return undefined;
    }
    try {
      const out = await run(git, cwd, ['rev-parse', '--is-inside-work-tree']);
      return out.trim() === 'true' ? new GitIgnore(git, cwd) : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Lists tracked and untracked-but-not-ignored files under `subdir` (or
   * everything), excluding tracked files that were deleted from disk.
   * Paths are relative to the workspace folder, because git prints paths
   * relative to the working directory.
   */
  async listFiles(subdir?: RelPath): Promise<RelPath[]> {
    const pathspec = subdir === undefined ? [] : ['--', subdir];
    const [all, deleted] = await Promise.all([
      run(this.git, this.cwd, [
        'ls-files',
        '-z',
        '--cached',
        '--others',
        '--exclude-standard',
        ...pathspec,
      ]),
      run(this.git, this.cwd, ['ls-files', '-z', '--deleted', ...pathspec]),
    ]);
    const gone = new Set(splitNul(deleted).map((path) => canonicalPath(path)));
    // `--cached` lists a path once per merge stage during conflicts; dedupe.
    const listed = new Set(splitNul(all).map((path) => canonicalPath(path)));
    return [...listed].filter((path) => !gone.has(path));
  }

  /**
   * Returns the subset of `paths` that git does *not* ignore. One process per batch.
   * Throws if git fails (e.g. a path inside a submodule). Callers should fail
   * open and keep the paths rather than lose them.
   */
  async withoutIgnored(paths: readonly RelPath[]): Promise<RelPath[]> {
    if (paths.length === 0) {
      return [];
    }
    let ignoredOut: string;
    try {
      ignoredOut = await run(
        this.git,
        this.cwd,
        ['check-ignore', '-z', '--stdin'],
        paths.join('\0'),
      );
    } catch (error) {
      // Exit code 1 means "none of these are ignored", which is not a failure.
      if (isExitCode(error, 1)) {
        return [...paths];
      }
      throw error;
    }
    const ignored = new Set(splitNul(ignoredOut).map((path) => canonicalPath(path)));
    return paths.filter((path) => !ignored.has(path));
  }
}

/**
 * Finds the git executable. On Windows, launching a bare `git` searches the
 * current directory (the workspace) before PATH, so a `git.exe` planted in a
 * repository would run instead. Resolving an absolute path from PATH avoids
 * that. Elsewhere, PATH lookup never includes the working directory implicitly.
 */
async function resolveGitExecutable(): Promise<string | undefined> {
  if (process.platform !== 'win32') {
    return 'git';
  }
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!path.isAbsolute(dir)) {
      continue; // Relative entries resolve against the workspace: unsafe.
    }
    const candidate = path.join(dir, 'git.exe');
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Not in this directory.
    }
  }
  return undefined;
}

function run(git: string, cwd: string, args: readonly string[], stdin?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      git,
      [...SAFE_CONFIG, ...args],
      { cwd, maxBuffer: MAX_BUFFER, encoding: 'utf8', windowsHide: true },
      (error, stdout) => {
        if (error) {
          reject(new GitError(error.message, error.code));
        } else {
          resolve(stdout);
        }
      },
    );
    if (stdin !== undefined) {
      child.stdin?.end(stdin);
    }
  });
}

function splitNul(output: string): string[] {
  return output.split('\0').filter((part) => part.length > 0);
}

/** A failed git invocation, keeping the exit code (Node's error type loses `Error`-ness). */
class GitError extends Error {
  constructor(
    message: string,
    readonly exitCode: string | number | null | undefined,
  ) {
    super(message);
    this.name = 'GitError';
  }
}

function isExitCode(error: unknown, code: number): boolean {
  return error instanceof GitError && error.exitCode === code;
}
