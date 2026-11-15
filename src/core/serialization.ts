import { initialState, type TrackingState } from './state';

/** Current on-disk schema version. Bump it and add a migration when the shape changes. */
export const STATE_VERSION = 1;

/**
 * The small, frequently written part of the state (must stay JSON-serializable).
 *
 * The baseline is stored separately (see {@link serializeBaseline}) because it
 * can hold 100k+ paths yet changes rarely. Keeping it out of this record means
 * a burst of agent-created files rewrites a few KB, not megabytes.
 */
export interface PersistedStateV1 {
  readonly version: 1;
  readonly tracking: boolean;
  readonly startedAt?: number;
  readonly pending: readonly string[];
  readonly opened: readonly string[];
}

/** Converts state into its persisted record (everything except the baseline). */
export function serialize(state: TrackingState): PersistedStateV1 {
  return {
    version: STATE_VERSION,
    tracking: state.tracking,
    ...(state.startedAt === undefined ? {} : { startedAt: state.startedAt }),
    pending: [...state.pending],
    opened: [...state.opened],
  };
}

/** Converts the baseline into its persisted form. */
export function serializeBaseline(state: TrackingState): string[] {
  return [...state.baseline];
}

/** Result of reading persisted state. `problem` explains why data was discarded. */
export interface DeserializeResult {
  readonly state: TrackingState;
  readonly problem?: string;
}

/**
 * Restores state from untrusted persisted data. Never throws: unknown versions
 * or malformed data fall back to the initial (not tracking) state with a reason,
 * so a corrupt record can never break activation.
 */
export function deserialize(rawRecord: unknown, rawBaseline: unknown): DeserializeResult {
  if (rawRecord === undefined) {
    return { state: initialState };
  }
  if (!isRecord(rawRecord)) {
    return { state: initialState, problem: 'stored state is not an object' };
  }
  if (rawRecord.version !== STATE_VERSION) {
    return {
      state: initialState,
      problem: `unsupported state version: ${String(rawRecord.version)}`,
    };
  }
  const { tracking, startedAt, pending, opened } = rawRecord;
  if (
    typeof tracking !== 'boolean' ||
    (startedAt !== undefined && typeof startedAt !== 'number') ||
    !isStringArray(pending) ||
    !isStringArray(opened)
  ) {
    return { state: initialState, problem: 'stored state has an invalid shape' };
  }
  if (!tracking) {
    return { state: initialState };
  }
  if (!isStringArray(rawBaseline)) {
    return { state: initialState, problem: 'stored baseline is missing or invalid' };
  }

  // Re-establish the disjointness invariant in case the data was edited by hand.
  const baselineSet = new Set(rawBaseline);
  const openedSet = new Set(opened.filter((path) => !baselineSet.has(path)));
  const pendingSet = new Set(
    pending.filter((path) => !baselineSet.has(path) && !openedSet.has(path)),
  );

  return {
    state: {
      tracking: true,
      startedAt,
      baseline: baselineSet,
      pending: pendingSet,
      opened: openedSet,
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}
