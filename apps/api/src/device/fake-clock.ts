import type { Cancel, Clock, Scheduler } from './clock.js';

/**
 * A clock that only moves when told to. Used by tests; it lives beside the real
 * clock so that every spec in the repository can share it.
 */
export class FakeClock implements Clock {
  constructor(private current = Date.parse('2026-01-01T00:00:00.000Z')) {}

  now(): number {
    return this.current;
  }

  advance(milliseconds: number): void {
    if (milliseconds < 0) {
      throw new RangeError('A clock cannot move backwards.');
    }

    this.current += milliseconds;
  }

  advanceSeconds(seconds: number): void {
    this.advance(seconds * 1000);
  }
}

/** A scheduler that runs its callbacks only when {@link ManualScheduler.tick} is called. */
export class ManualScheduler implements Scheduler {
  private readonly callbacks = new Set<() => void>();

  /** How many callbacks are currently scheduled. */
  get active(): number {
    return this.callbacks.size;
  }

  every(_intervalMs: number, callback: () => void): Cancel {
    this.callbacks.add(callback);

    return () => {
      this.callbacks.delete(callback);
    };
  }

  tick(): void {
    for (const callback of [...this.callbacks]) {
      callback();
    }
  }
}
