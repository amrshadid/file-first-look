import type { RelPath } from './paths';
import { reduce, type TrackingEvent, type TrackingState } from './state';

/** Side effects the tracker needs, injected so the core stays free of VS Code (ADR 0001). */
export interface TrackerPorts {
  /** Lists every eligible file currently in the workspace. */
  scan(): Promise<readonly RelPath[]>;
  /** Persists state. Implementations may debounce. */
  save(state: TrackingState): void;
  /** Current time in epoch milliseconds. */
  now(): number;
}

/** Events that adapters may dispatch directly. Lifecycle events go through methods. */
export type LiveEvent = Extract<
  TrackingEvent,
  { type: 'created' | 'deleted' | 'renamed' | 'visited' | 'markedOpened' }
>;

/** Minimal disposable shape, structurally compatible with `vscode.Disposable`. */
export interface Unsubscribe {
  dispose(): void;
}

type Listener = (state: TrackingState) => void;

/**
 * Owns the tracking state and applies events strictly one at a time.
 *
 * Every operation is appended to a single promise queue. While a scan for
 * {@link start}, {@link reconcile} or {@link rescope} is in flight, live events
 * wait behind it and are applied right after the scan result. That ordering is
 * what makes "queue events while taking the baseline, then apply them before
 * publishing" hold without extra bookkeeping.
 */
export class Tracker {
  private current: TrackingState;
  private queue: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<Listener>();

  constructor(
    initial: TrackingState,
    private readonly ports: TrackerPorts,
  ) {
    this.current = initial;
  }

  /** The latest applied state. */
  get state(): TrackingState {
    return this.current;
  }

  /** Subscribes to state changes. Listeners only run when something actually changed. */
  onDidChange(listener: Listener): Unsubscribe {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  /** Queues a live event from a watcher or editor. */
  dispatch(event: LiveEvent): Promise<void> {
    return this.enqueue(() => {
      this.apply(event);
    });
  }

  /** Takes a fresh baseline and starts tracking (restarts if already tracking). */
  start(): Promise<void> {
    return this.enqueue(async () => {
      const present = await this.ports.scan();
      this.apply({ type: 'started', at: this.ports.now(), present });
    });
  }

  /** Stops tracking and discards all state. */
  stop(): Promise<void> {
    return this.enqueue(() => {
      this.apply({ type: 'stopped' });
    });
  }

  /** Rescans and adds files that appeared while no events were observed. */
  reconcile(): Promise<void> {
    return this.enqueue(async () => {
      if (!this.current.tracking) {
        return;
      }
      const present = await this.ports.scan();
      this.apply({ type: 'reconciled', present });
    });
  }

  /** Rescans after the exclusion settings changed. */
  rescope(): Promise<void> {
    return this.enqueue(async () => {
      if (!this.current.tracking) {
        return;
      }
      const present = await this.ports.scan();
      this.apply({ type: 'scopeChanged', present });
    });
  }

  /** Resolves once every operation queued so far has been applied. */
  idle(): Promise<void> {
    return this.queue;
  }

  private enqueue(operation: () => void | Promise<void>): Promise<void> {
    const result = this.queue.then(operation);
    // Keep the queue alive after a failure. The caller still sees the rejection via `result`.
    this.queue = result.catch(() => undefined);
    return result;
  }

  private apply(event: TrackingEvent): void {
    const next = reduce(this.current, event);
    if (next === this.current) {
      return;
    }
    this.current = next;
    this.ports.save(next);
    for (const listener of this.listeners) {
      listener(next);
    }
  }
}
