import { describe, expect, it, vi } from 'vitest';

import { initialState, Tracker, type TrackerPorts } from '../../src/core';
import { sorted } from './helpers';

/** A scan whose completion the test controls, to reproduce race conditions. */
function deferredScan(): { scan: TrackerPorts['scan']; resolve: (paths: string[]) => void } {
  let resolve: (paths: string[]) => void = () => undefined;
  const scan = (): Promise<string[]> =>
    new Promise((r) => {
      resolve = r;
    });
  return {
    scan,
    resolve: (paths) => {
      resolve(paths);
    },
  };
}

function makePorts(overrides: Partial<TrackerPorts> = {}): TrackerPorts {
  return { scan: () => Promise.resolve([]), save: vi.fn(), now: () => 42, ...overrides };
}

describe('Tracker', () => {
  it('starts with an empty list after taking a baseline', async () => {
    const tracker = new Tracker(initialState, makePorts({ scan: () => Promise.resolve(['a.ts']) }));
    await tracker.start();
    expect(tracker.state.tracking).toBe(true);
    expect(tracker.state.startedAt).toBe(42);
    expect(tracker.state.pending.size).toBe(0);
  });

  it('applies events that arrive during the baseline scan after the baseline', async () => {
    const { scan, resolve } = deferredScan();
    const tracker = new Tracker(initialState, makePorts({ scan }));

    const started = tracker.start();
    const created = tracker.dispatch({ type: 'created', path: 'during.ts' });
    await Promise.resolve();
    resolve(['a.ts']);
    await Promise.all([started, created]);

    expect(sorted(tracker.state.pending)).toEqual(['during.ts']);
  });

  it('persists and notifies only when the state changes', async () => {
    const save = vi.fn();
    const tracker = new Tracker(initialState, makePorts({ save }));
    const listener = vi.fn();
    tracker.onDidChange(listener);

    await tracker.start();
    await tracker.dispatch({ type: 'created', path: 'n.ts' });
    await tracker.dispatch({ type: 'created', path: 'n.ts' });

    expect(save).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('stops notifying a disposed listener', async () => {
    const tracker = new Tracker(initialState, makePorts());
    const listener = vi.fn();
    tracker.onDidChange(listener).dispose();
    await tracker.start();
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not scan for reconcile or rescope when not tracking', async () => {
    const scan = vi.fn(() => Promise.resolve([] as string[]));
    const tracker = new Tracker(initialState, makePorts({ scan }));
    await tracker.reconcile();
    await tracker.rescope();
    expect(scan).not.toHaveBeenCalled();
  });

  it('reconciles files added while closed into the list', async () => {
    let present = ['a.ts'];
    const tracker = new Tracker(initialState, makePorts({ scan: () => Promise.resolve(present) }));
    await tracker.start();
    present = ['a.ts', 'offline.ts'];
    await tracker.reconcile();
    expect(sorted(tracker.state.pending)).toEqual(['offline.ts']);
  });

  it('rescopes newly included files into the baseline', async () => {
    let present = ['a.ts'];
    const tracker = new Tracker(initialState, makePorts({ scan: () => Promise.resolve(present) }));
    await tracker.start();
    present = ['a.ts', 'vendor/x.js'];
    await tracker.rescope();
    expect(tracker.state.pending.size).toBe(0);
    expect(tracker.state.baseline.has('vendor/x.js')).toBe(true);
  });

  it('keeps processing after a failed scan', async () => {
    const tracker = new Tracker(
      initialState,
      makePorts({ scan: () => Promise.reject(new Error('disk on fire')) }),
    );
    await expect(tracker.start()).rejects.toThrow('disk on fire');
    await tracker.stop();
    await expect(tracker.idle()).resolves.toBeUndefined();
    expect(tracker.state.tracking).toBe(false);
  });

  it('stop discards state', async () => {
    const tracker = new Tracker(initialState, makePorts());
    await tracker.start();
    await tracker.stop();
    expect(tracker.state).toBe(initialState);
  });
});
