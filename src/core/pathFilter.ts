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
   * The exclusions combined into one glob for `workspace.findFiles`, or
   * `undefined` when there are none.
   */
  readonly combinedExcludeGlob: string | undefined;
}

/** Builds a {@link PathFilter} from user-facing exclusion globs. */
export function createPathFilter(excludeGlobs: readonly string[]): PathFilter {
  const globs = excludeGlobs.map((glob) => glob.trim()).filter((glob) => glob.length > 0);

  if (globs.length === 0) {
    return { isIncluded: () => true, combinedExcludeGlob: undefined };
  }

  // `dot: true` so patterns like `**/.cache/**` behave as users expect.
  const isExcluded = picomatch(globs, { dot: true });

  return {
    isIncluded: (path) => !isExcluded(path),
    combinedExcludeGlob: globs.length === 1 ? globs[0] : `{${globs.join(',')}}`,
  };
}
