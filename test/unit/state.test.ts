import { describe, expect, it } from 'vitest';

import { initialState, isKnown, reduce } from '../../src/core';
import { run, sorted } from './helpers';

describe('reduce', () => {
  describe('started', () => {
    it('makes every present path the baseline and begins with an empty list', () => {
      const state = run(['a.ts', 'src/b.ts']);
      expect(state.tracking).toBe(true);
      expect(state.startedAt).toBe(1);
      expect(sorted(state.baseline)).toEqual(['a.ts', 'src/b.ts']);
      expect(state.pending.size).toBe(0);
    });

    it('restarting discards previous pending and opened paths', () => {
      const before = run([], { type: 'created', path: 'x.ts' });
      const after = reduce(before, { type: 'started', at: 2, present: ['x.ts'] });
      expect(after.pending.size).toBe(0);
      expect(sorted(after.baseline)).toEqual(['x.ts']);
    });
  });

  describe('when not tracking', () => {
    it('ignores every event except started', () => {
      expect(reduce(initialState, { type: 'created', path: 'a.ts' })).toBe(initialState);
      expect(reduce(initialState, { type: 'visited', path: 'a.ts' })).toBe(initialState);
    });
  });

  describe('created', () => {
    it('lists a new path as pending exactly once', () => {
      const state = run(
        [],
        { type: 'created', path: 'src/new.ts' },
        { type: 'created', path: 'src/new.ts' },
      );
      expect(sorted(state.pending)).toEqual(['src/new.ts']);
    });

    it('ignores baseline paths', () => {
      const state = run(['a.ts'], { type: 'created', path: 'a.ts' });
      expect(state.pending.size).toBe(0);
    });

    it('returns the same object when nothing changed', () => {
      const state = run(['a.ts']);
      expect(reduce(state, { type: 'created', path: 'a.ts' })).toBe(state);
    });
  });

  describe('visited', () => {
    it('moves a pending path to opened', () => {
      const state = run([], { type: 'created', path: 'n.ts' }, { type: 'visited', path: 'n.ts' });
      expect(state.pending.size).toBe(0);
      expect(sorted(state.opened)).toEqual(['n.ts']);
    });

    it('does nothing for baseline paths', () => {
      const state = run(['a.ts']);
      expect(reduce(state, { type: 'visited', path: 'a.ts' })).toBe(state);
    });

    it('handles a visit that arrives before the watcher create event', () => {
      const state = run(
        [],
        { type: 'visited', path: 'fast.ts' },
        { type: 'created', path: 'fast.ts' },
      );
      expect(state.pending.size).toBe(0);
      expect(sorted(state.opened)).toEqual(['fast.ts']);
    });

    it('keeps an opened file off the list after later activity', () => {
      const state = run(
        [],
        { type: 'created', path: 'n.ts' },
        { type: 'visited', path: 'n.ts' },
        { type: 'created', path: 'n.ts' },
      );
      expect(state.pending.size).toBe(0);
    });
  });

  describe('markedOpened', () => {
    it('moves only pending paths to opened', () => {
      const state = run(
        ['base.ts'],
        { type: 'created', path: 'a.ts' },
        { type: 'created', path: 'b.ts' },
        { type: 'markedOpened', paths: ['a.ts', 'base.ts', 'unknown.ts'] },
      );
      expect(sorted(state.pending)).toEqual(['b.ts']);
      expect(sorted(state.opened)).toEqual(['a.ts']);
      expect(sorted(state.baseline)).toEqual(['base.ts']);
    });
  });

  describe('deleted', () => {
    it('removes a file from every set', () => {
      const state = run(['a.ts'], { type: 'deleted', path: 'a.ts' });
      expect(isKnown(state, 'a.ts')).toBe(false);
    });

    it('removes all descendants when a folder is deleted with a single event', () => {
      const state = run(
        ['keep.ts', 'gen/old.ts'],
        { type: 'created', path: 'gen/a.ts' },
        { type: 'created', path: 'gen/sub/b.ts' },
        { type: 'created', path: 'generated.ts' },
        { type: 'deleted', path: 'gen' },
      );
      expect(sorted(state.baseline)).toEqual(['keep.ts']);
      expect(sorted(state.pending)).toEqual(['generated.ts']);
    });

    it('treats a re-created path as new', () => {
      const state = run(
        ['a.ts'],
        { type: 'deleted', path: 'a.ts' },
        { type: 'created', path: 'a.ts' },
      );
      expect(sorted(state.pending)).toEqual(['a.ts']);
    });
  });

  describe('renamed', () => {
    it('carries pending, opened and baseline membership to the new path', () => {
      const state = run(
        ['base.ts'],
        { type: 'created', path: 'p.ts' },
        { type: 'created', path: 'o.ts' },
        { type: 'visited', path: 'o.ts' },
        { type: 'renamed', from: 'base.ts', to: 'base2.ts' },
        { type: 'renamed', from: 'p.ts', to: 'p2.ts' },
        { type: 'renamed', from: 'o.ts', to: 'o2.ts' },
      );
      expect(sorted(state.baseline)).toEqual(['base2.ts']);
      expect(sorted(state.pending)).toEqual(['p2.ts']);
      expect(sorted(state.opened)).toEqual(['o2.ts']);
    });

    it('moves a whole folder', () => {
      const state = run(
        [],
        { type: 'created', path: 'old/a.ts' },
        { type: 'created', path: 'old/sub/b.ts' },
        { type: 'renamed', from: 'old', to: 'new' },
      );
      expect(sorted(state.pending)).toEqual(['new/a.ts', 'new/sub/b.ts']);
    });

    it('replaces whatever was at the destination', () => {
      const state = run(
        ['target.ts'],
        { type: 'created', path: 'src.ts' },
        { type: 'renamed', from: 'src.ts', to: 'target.ts' },
      );
      expect(sorted(state.baseline)).toEqual([]);
      expect(sorted(state.pending)).toEqual(['target.ts']);
    });

    it('is a no-op for an identity rename', () => {
      const state = run(['a.ts']);
      expect(reduce(state, { type: 'renamed', from: 'a.ts', to: 'a.ts' })).toBe(state);
    });
  });

  describe('reconciled', () => {
    it('lists files added while VS Code was closed and drops missing ones', () => {
      const state = run(
        ['a.ts', 'gone.ts'],
        { type: 'created', path: 'p.ts' },
        { type: 'reconciled', present: ['a.ts', 'p.ts', 'offline.ts'] },
      );
      expect(sorted(state.baseline)).toEqual(['a.ts']);
      expect(sorted(state.pending)).toEqual(['offline.ts', 'p.ts']);
    });

    it('keeps opened status for files that still exist', () => {
      const state = run(
        [],
        { type: 'created', path: 'o.ts' },
        { type: 'visited', path: 'o.ts' },
        { type: 'reconciled', present: ['o.ts'] },
      );
      expect(sorted(state.opened)).toEqual(['o.ts']);
      expect(state.pending.size).toBe(0);
    });
  });

  describe('scopeChanged', () => {
    it('adds newly in-scope existing files to the baseline, not the list', () => {
      const state = run(['a.ts'], {
        type: 'scopeChanged',
        present: ['a.ts', 'vendor/lib.js', 'vendor/other.js'],
      });
      expect(state.pending.size).toBe(0);
      expect(sorted(state.baseline)).toEqual(['a.ts', 'vendor/lib.js', 'vendor/other.js']);
    });

    it('drops tracked paths that became excluded', () => {
      const state = run(
        [],
        { type: 'created', path: 'notes/handoff.md' },
        { type: 'scopeChanged', present: [] },
      );
      expect(state.pending.size).toBe(0);
    });
  });

  describe('performance', () => {
    it('does not copy the baseline for events that do not touch it', () => {
      const big = Array.from({ length: 50_000 }, (_, i) => `src/file${i}.ts`);
      const start = run(big);
      const next = reduce(start, { type: 'created', path: 'new.ts' });
      const visited = reduce(next, { type: 'visited', path: 'new.ts' });
      expect(next.baseline).toBe(start.baseline);
      expect(visited.baseline).toBe(start.baseline);
    });

    it('deletes a single file without scanning for descendants', () => {
      const state = run(['a.ts', 'a.ts.bak']);
      const next = reduce(state, { type: 'deleted', path: 'a.ts' });
      expect(sorted(next.baseline)).toEqual(['a.ts.bak']);
    });
  });

  describe('stopped', () => {
    it('resets to the initial state', () => {
      expect(run(['a.ts'], { type: 'stopped' })).toBe(initialState);
    });
  });
});
