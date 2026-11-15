import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StateStore } from '../../src/adapters/stateStore';
import { initialState, reduce } from '../../src/core';
import { run, sorted } from './helpers';

describe('StateStore', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'ffl-store-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('round-trips state through files, as across a restart', async () => {
    const state = run(['a.ts'], { type: 'created', path: 'p.ts' });
    const first = new StateStore(dir, vi.fn());
    await first.load();
    first.save(state);
    await first.flush();

    const restored = await new StateStore(dir, vi.fn()).load();
    expect(restored.problem).toBeUndefined();
    expect(sorted(restored.state.baseline)).toEqual(['a.ts']);
    expect(sorted(restored.state.pending)).toEqual(['p.ts']);
  });

  it('starts fresh when nothing is stored', async () => {
    const { state, problem } = await new StateStore(path.join(dir, 'missing'), vi.fn()).load();
    expect(state).toBe(initialState);
    expect(problem).toBeUndefined();
  });

  it('reports unreadable files instead of throwing', async () => {
    await writeFile(path.join(dir, 'state.json'), '{not json');
    const { state, problem } = await new StateStore(dir, vi.fn()).load();
    expect(state).toBe(initialState);
    expect(problem).toMatch(/unreadable/);
  });

  it('rewrites the baseline file only when the baseline changed', async () => {
    const store = new StateStore(dir, vi.fn());
    await store.load();
    const started = run(['a.ts']);
    store.save(started);
    await store.flush();
    const baselineFile = path.join(dir, 'baseline.json');
    await writeFile(baselineFile, JSON.stringify(['marker.ts']));

    store.save(reduce(started, { type: 'created', path: 'n.ts' }));
    await store.flush();
    expect(JSON.parse(await readFile(baselineFile, 'utf8'))).toEqual(['marker.ts']);
  });

  it('removes the files when tracking stops and leaves no temp files', async () => {
    const store = new StateStore(dir, vi.fn());
    await store.load();
    const started = run(['a.ts']);
    store.save(started);
    await store.flush();
    store.save(reduce(started, { type: 'stopped' }));
    await store.flush();
    expect(await readdir(dir)).toEqual([]);
  });

  it('remembers the scope the baseline was taken with', async () => {
    const store = new StateStore(dir, vi.fn());
    expect(await store.readScope()).toBeUndefined();
    await store.writeScope('{"exclude":[],"git":true}');
    expect(await new StateStore(dir, vi.fn()).readScope()).toBe('{"exclude":[],"git":true}');
  });

  it('reports a failed write and rewrites the baseline on the next save', async () => {
    const blocker = path.join(dir, 'not-a-dir');
    await writeFile(blocker, 'x'); // mkdir under a file fails
    const onError = vi.fn();
    const store = new StateStore(path.join(blocker, 'state'), onError);
    await store.load();
    const started = run(['a.ts']);
    store.save(started);
    await store.flush();
    expect(onError).toHaveBeenCalledTimes(1);

    // A later save still runs (the chain isn't stuck) and retries the baseline.
    store.save(reduce(started, { type: 'created', path: 'n.ts' }));
    await store.flush();
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it('collapses a burst of saves into the latest state', async () => {
    const store = new StateStore(dir, vi.fn());
    await store.load();
    let state = run([]);
    for (let i = 0; i < 50; i++) {
      state = reduce(state, { type: 'created', path: `f${i}.ts` });
      store.save(state);
    }
    await store.flush();
    const { state: restored } = await new StateStore(dir, vi.fn()).load();
    expect(restored.pending.size).toBe(50);
  });
});
