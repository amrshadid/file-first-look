import { describe, expect, it } from 'vitest';

import { deserialize, initialState, serialize, serializeBaseline } from '../../src/core';
import { run, sorted } from './helpers';

/** Simulates a round trip through JSON storage. */
function roundTrip(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

describe('serialization', () => {
  it('round-trips a tracking state', () => {
    const state = run(
      ['b.ts', 'a.ts'],
      { type: 'created', path: 'p.ts' },
      { type: 'created', path: 'o.ts' },
      { type: 'visited', path: 'o.ts' },
    );
    const { state: restored, problem } = deserialize(
      roundTrip(serialize(state)),
      roundTrip(serializeBaseline(state)),
    );

    expect(problem).toBeUndefined();
    expect(restored.tracking).toBe(true);
    expect(restored.startedAt).toBe(1);
    expect(sorted(restored.baseline)).toEqual(['a.ts', 'b.ts']);
    expect(sorted(restored.pending)).toEqual(['p.ts']);
    expect(sorted(restored.opened)).toEqual(['o.ts']);
  });

  it('keeps the baseline out of the frequently written record', () => {
    expect(serialize(run(['a.ts']))).not.toHaveProperty('baseline');
  });

  it('restores a stored "not tracking" record as the initial state', () => {
    const raw = { version: 1, tracking: false, pending: [], opened: [] };
    expect(deserialize(raw, undefined)).toEqual({ state: initialState });
  });

  it('treats missing data as not tracking without a problem', () => {
    expect(deserialize(undefined, undefined)).toEqual({ state: initialState });
  });

  it.each([
    ['a non-object', 'nope', []],
    ['an array', [], []],
    ['an unknown version', { version: 99 }, []],
    ['a wrong shape', { version: 1, tracking: true, pending: 'x', opened: [] }, []],
    ['a non-string path', { version: 1, tracking: true, pending: [1], opened: [] }, []],
    ['a missing baseline', { version: 1, tracking: true, pending: [], opened: [] }, undefined],
  ])('falls back safely for %s', (_label, record, baseline) => {
    const result = deserialize(record, baseline);
    expect(result.state).toBe(initialState);
    expect(result.problem).toBeTypeOf('string');
  });

  it('repairs overlapping sets so the invariant holds', () => {
    const { state } = deserialize(
      { version: 1, tracking: true, startedAt: 5, pending: ['a', 'b', 'c'], opened: ['a', 'c'] },
      ['a'],
    );
    expect(sorted(state.baseline)).toEqual(['a']);
    expect(sorted(state.opened)).toEqual(['c']);
    expect(sorted(state.pending)).toEqual(['b']);
  });
});
