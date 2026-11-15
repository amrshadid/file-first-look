import { reduce, initialState, type TrackingEvent, type TrackingState } from '../../src/core';

/** Starts tracking with the given baseline and applies the remaining events in order. */
export function run(baseline: readonly string[], ...events: TrackingEvent[]): TrackingState {
  const started = reduce(initialState, { type: 'started', at: 1, present: baseline });
  return events.reduce(reduce, started);
}

/** Sorted array view of a set, for readable assertions. */
export function sorted(set: ReadonlySet<string>): string[] {
  return [...set].sort();
}
