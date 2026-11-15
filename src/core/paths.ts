/**
 * Path helpers shared by the core and the adapters.
 *
 * All tracked paths are *workspace-relative POSIX paths* (`src/app.ts`), never
 * absolute and never with a leading `./` or `/`. Using one canonical form keeps
 * state portable across machines and makes set membership exact.
 */

/** A workspace-relative path using `/` separators, e.g. `src/app.ts`. */
export type RelPath = string;

/** Converts a relative path from any platform to the canonical POSIX form. */
export function toRelPath(path: string): RelPath {
  return path
    .replace(/\\/g, '/')
    .replace(/^(\.\/)+/, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
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
