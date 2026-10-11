/**
 * Time source for code whose behaviour depends on the clock.
 *
 * Injecting it, instead of calling `Date.now()` or `setTimeout` directly, is
 * what lets the simulator be tested for minutes of drawing in microseconds and
 * without a single real timer.
 */
export interface Clock {
  /** Milliseconds since the Unix epoch. */
  now(): number;
}

/** Dependency-injection token for the {@link Clock} a service should use. */
export const CLOCK = Symbol('CLOCK');

export const systemClock: Clock = {
  now: () => Date.now(),
};

/** Stops a repeating callback started by a {@link Scheduler}. */
export type Cancel = () => void;

/** Runs a callback repeatedly. Injectable for the same reason as {@link Clock}. */
export interface Scheduler {
  every(intervalMs: number, callback: () => void): Cancel;
}

/**
 * Real timers. The interval is `unref`'d so it never keeps the process alive on
 * its own: shutting the API down must not wait for a simulator tick.
 */
export const intervalScheduler: Scheduler = {
  every(intervalMs, callback) {
    const timer = setInterval(callback, intervalMs);
    timer.unref();

    return () => {
      clearInterval(timer);
    };
  },
};
