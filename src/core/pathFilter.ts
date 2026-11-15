import picomatch from 'picomatch';

import type { RelPath } from './paths';

/**
 * Decides which paths are eligible for tracking.
 *
 * The same filter is applied to the initial scan and to live file events, so a
 * path can never be listed by one route and hidden by another (ADR 0004).
 */
export interface PathFilter {
  /** True when the path is in scope (not matched by any exclusion). */
  isIncluded(path: RelPath): boolean;
  /**
   * A single glob for `workspace.findFiles` so excluded trees are never walked,
   * or `undefined` when there is nothing safe to combine. It is an optimization
   * only: results are always re-checked with {@link isIncluded}.
   */
  readonly combinedExcludeGlob: string | undefined;
}

/**
 * Version-control internals are never meant to be read and are rewritten
 * constantly (`.git/FETCH_HEAD`, refs, locks). They are always excluded, even
 * when a user replaces the `exclude` setting, because VS Code array settings
 * replace the default rather than merge with it.
 */
export const ALWAYS_EXCLUDED: readonly string[] = ['**/.git/**', '**/.hg/**', '**/.svn/**'];

/** Builds a {@link PathFilter} from user-facing exclusion globs. */
export function createPathFilter(excludeGlobs: readonly string[]): PathFilter {
  const globs = [
    ...new Set([...ALWAYS_EXCLUDED, ...excludeGlobs.map((glob) => glob.trim())]),
  ].filter((glob) => glob.length > 0);

  // `dot: true` so patterns like `**/.cache/**` behave as users expect.
  const isExcluded = picomatch(globs, { dot: true });

  // VS Code globs don't support nested braces, so globs that contain their own
  // `{…}` group are left out of the combined glob. They still apply through
  // `isIncluded`.
  const combinable = globs.filter((glob) => !glob.includes('{'));
  const combinedExcludeGlob =
    combinable.length === 0
      ? undefined
      : combinable.length === 1
        ? combinable[0]
        : `{${combinable.join(',')}}`;

  return { isIncluded: (path) => !isExcluded(path), combinedExcludeGlob };
}
