/**
 * Path helpers shared by the core and the adapters.
 *
 * All tracked paths are *workspace-relative POSIX paths* (`src/app.ts`), never
 * absolute and never with a leading `./` or `/`. Using one canonical form keeps
 * state portable across machines and makes set membership exact.
 */

/** A workspace-relative path using `/` separators, e.g. `src/app.ts`. */
export type RelPath = string;

/**
 * Tidies a `/`-separated relative path into the canonical form. Callers convert
 * platform separators first: a backslash is a legal character in file names on
 * Linux and macOS, so it must not be treated as a separator here.
 */
export function toRelPath(path: string): RelPath {
  return path
    .replace(/^(\.\/)+/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

/** Every ancestor folder of `path`, nearest first: `a/b/c.ts` → `['a/b', 'a']`. */
export function ancestorsOf(path: RelPath): RelPath[] {
  const result: RelPath[] = [];
  let index = path.lastIndexOf('/');
  while (index > 0) {
    result.push(path.slice(0, index));
    index = path.lastIndexOf('/', index - 1);
  }
  return result;
}

/** True when `candidate` equals `ancestor` or lives anywhere beneath it. */
export function isSameOrDescendant(candidate: RelPath, ancestor: RelPath): boolean {
  return candidate === ancestor || candidate.startsWith(`${ancestor}/`);
}

/**
 * Re-roots `path` from `from` to `to`, used when a file or folder is renamed.
 * Returns `undefined` when `path` is not `from` or one of its descendants.
 */
export function rebase(path: RelPath, from: RelPath, to: RelPath): RelPath | undefined {
  if (!isSameOrDescendant(path, from)) {
    return undefined;
  }
  return to + path.slice(from.length);
}
