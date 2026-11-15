import { ancestorsOf, rebase, type RelPath } from './paths';

/**
 * The complete tracking state (ADR 0002).
 *
 * `baseline`, `pending` and `opened` are always disjoint:
 * - `baseline`: seen before tracking started (or entered scope via a settings change).
 * - `pending`: appeared after tracking started and has not been opened yet.
 *   This is the only set the user sees, and it only holds files that exist.
 * - `opened`: appeared after tracking started and has been opened at least once.
 *
 * `baseline` and `opened` are the paths the user already *knows*. They are
 * remembered for the whole tracking session, even after a file is deleted. A
 * branch switch, `git stash` or a regenerate-on-build tool removes and later
 * restores files, and a path the user has already seen must never come back
 * as "new". Forgetting known paths would refill the list on every branch
 * round trip.
 */
export interface TrackingState {
  readonly tracking: boolean;
  /** Epoch milliseconds when tracking started, if tracking. */
  readonly startedAt: number | undefined;
  readonly baseline: ReadonlySet<RelPath>;
  readonly pending: ReadonlySet<RelPath>;
  readonly opened: ReadonlySet<RelPath>;
}

/** Everything that can happen to the tracking state. */
export type TrackingEvent =
  /** Tracking (re)starts; every present path becomes the baseline. */
  | { readonly type: 'started'; readonly at: number; readonly present: readonly RelPath[] }
  /** Tracking stops and all state is discarded. */
  | { readonly type: 'stopped' }
  /** A file appeared on disk. */
  | { readonly type: 'created'; readonly path: RelPath }
  /** Files or folders disappeared (batched); pending rows under them go away. */
  | { readonly type: 'deleted'; readonly paths: readonly RelPath[] }
  /** A file or folder was renamed inside VS Code; membership moves with it. */
  | { readonly type: 'renamed'; readonly from: RelPath; readonly to: RelPath }
  /** A human looked at a file (see ADR 0003 for what counts). */
  | { readonly type: 'visited'; readonly path: RelPath }
  /** The user explicitly marked files as opened (escape hatch). */
  | { readonly type: 'markedOpened'; readonly paths: readonly RelPath[] }
  /** A full rescan, e.g. after a restart; catches files added while closed. */
  | { readonly type: 'reconciled'; readonly present: readonly RelPath[] }
  /**
   * A full rescan after the scope changed (exclusions, .gitignore, trust).
   * Newly in-scope paths join the baseline, never the pending list.
   */
  | { readonly type: 'scopeChanged'; readonly present: readonly RelPath[] };

export const initialState: TrackingState = Object.freeze({
  tracking: false,
  startedAt: undefined,
  baseline: new Set<RelPath>(),
  pending: new Set<RelPath>(),
  opened: new Set<RelPath>(),
});

/** True when the path is tracked in any of the three sets. */
export function isKnown(state: TrackingState, path: RelPath): boolean {
  return state.baseline.has(path) || state.pending.has(path) || state.opened.has(path);
}

/**
 * Applies one event and returns the next state.
 *
 * Pure and idempotent: applying the same event twice has the same effect as
 * applying it once. When nothing changes, the *same* object is returned, so
 * callers can skip persistence and re-rendering with a reference check.
 */
export function reduce(state: TrackingState, event: TrackingEvent): TrackingState {
  if (event.type === 'started') {
    return {
      tracking: true,
      startedAt: event.at,
      baseline: new Set(event.present),
      pending: new Set(),
      opened: new Set(),
    };
  }

  if (!state.tracking) {
    // Nothing but `started` has meaning while tracking is off.
    return state;
  }

  const draft = new Draft(state);

  switch (event.type) {
    case 'stopped':
      return initialState;

    case 'created':
      if (!isKnown(state, event.path)) {
        draft.add('pending', event.path);
      }
      break;

    case 'deleted':
      draft.removePendingUnder(event.paths);
      break;

    case 'renamed':
      draft.moveSubtree(event.from, event.to);
      break;

    case 'visited':
      if (!draft.move(event.path, 'pending', 'opened') && !isKnown(state, event.path)) {
        // The file was opened before its watcher "create" arrived. Recording it
        // now makes that late event a no-op instead of a false "unopened" row.
        draft.add('opened', event.path);
      }
      break;

    case 'markedOpened':
      for (const path of event.paths) {
        draft.move(path, 'pending', 'opened');
      }
      break;

    case 'reconciled':
      draft.syncWith(event.present, 'pending');
      break;

    case 'scopeChanged':
      draft.syncWith(event.present, 'baseline');
      break;
  }

  return draft.result();
}

type SetName = 'baseline' | 'pending' | 'opened';
const SET_NAMES: readonly SetName[] = ['baseline', 'pending', 'opened'];

/**
 * Copy-on-write helper so the reducer can use plain set operations while still
 * returning the original object when nothing changed.
 *
 * Sets are cloned lazily, on first write only. In a large repository the
 * baseline can hold 100k+ paths, and most events never touch it: creates,
 * visits and deletes only change `pending`/`opened`. Leaving it unshared avoids
 * an O(n) copy per event, and an untouched set keeps its identity, which also
 * lets the store skip re-writing it.
 */
class Draft {
  private readonly copies: Partial<Record<SetName, Set<RelPath>>> = {};

  constructor(private readonly source: TrackingState) {}

  /** Read-only view of a set: the copy if one exists, otherwise the original. */
  read(name: SetName): ReadonlySet<RelPath> {
    return this.copies[name] ?? this.source[name];
  }

  /** Writable copy of a set, cloned on first use. */
  write(name: SetName): Set<RelPath> {
    let copy = this.copies[name];
    if (copy === undefined) {
      copy = new Set(this.source[name]);
      this.copies[name] = copy;
    }
    return copy;
  }

  has(path: RelPath): boolean {
    return SET_NAMES.some((name) => this.read(name).has(path));
  }

  /** Moves `path` between sets if it is in `from`. Returns true when it moved. */
  move(path: RelPath, from: SetName, to: SetName): boolean {
    if (!this.read(from).has(path)) {
      return false;
    }
    this.write(from).delete(path);
    this.write(to).add(path);
    return true;
  }

  add(name: SetName, path: RelPath): void {
    this.write(name).add(path);
  }

  /**
   * Drops pending rows that are, or live under, any of `roots` (a folder delete
   * can arrive as one event). Cost is O(pending × depth) for the whole batch,
   * independent of the baseline size, so `rm -rf dist` with 10k files is cheap.
   */
  removePendingUnder(roots: readonly RelPath[]): void {
    if (roots.length === 0 || this.read('pending').size === 0) {
      return;
    }
    const rootSet = new Set(roots);
    const doomed = [...this.read('pending')].filter(
      (path) => rootSet.has(path) || ancestorsOf(path).some((dir) => rootSet.has(dir)),
    );
    if (doomed.length > 0) {
      const pending = this.write('pending');
      for (const path of doomed) {
        pending.delete(path);
      }
    }
  }

  /**
   * Moves membership from `from` to `to`, including descendants. O(n) over all
   * sets, which is fine: this only runs for renames done by the user inside VS Code.
   */
  moveSubtree(from: RelPath, to: RelPath): void {
    if (from === to) {
      return;
    }
    for (const name of SET_NAMES) {
      const moved: [RelPath, RelPath][] = [];
      for (const path of this.read(name)) {
        const next = rebase(path, from, to);
        if (next !== undefined) {
          moved.push([path, next]);
        }
      }
      if (moved.length > 0) {
        // A rename onto an existing path replaces it in every set.
        for (const [, next] of moved) {
          for (const other of SET_NAMES) {
            if (this.read(other).has(next)) {
              this.write(other).delete(next);
            }
          }
        }
        const set = this.write(name);
        for (const [old] of moved) {
          set.delete(old);
        }
        for (const [, next] of moved) {
          set.add(next);
        }
      }
    }
  }

  /**
   * Applies a full scan: pending rows for files that no longer exist (or left
   * scope) are dropped, and unknown present files are added to `target`. Known
   * paths are kept even when absent (see {@link TrackingState}).
   */
  syncWith(present: readonly RelPath[], target: 'pending' | 'baseline'): void {
    const presentSet = new Set(present);
    const missing = [...this.read('pending')].filter((path) => !presentSet.has(path));
    if (missing.length > 0) {
      const pending = this.write('pending');
      for (const path of missing) {
        pending.delete(path);
      }
    }
    for (const path of presentSet) {
      if (!this.has(path)) {
        this.add(target, path);
      }
    }
  }

  result(): TrackingState {
    if (Object.keys(this.copies).length === 0) {
      return this.source;
    }
    return {
      tracking: this.source.tracking,
      startedAt: this.source.startedAt,
      baseline: this.read('baseline'),
      pending: this.read('pending'),
      opened: this.read('opened'),
    };
  }
}
