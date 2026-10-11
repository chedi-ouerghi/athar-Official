import { describe, expect, it, vi } from 'vitest';
import { intervalScheduler, systemClock } from './clock.js';
import { FakeClock, ManualScheduler } from './fake-clock.js';

describe('systemClock', () => {
  it('reports the current time in milliseconds', () => {
    const before = Date.now();
    const now = systemClock.now();

    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});

describe('FakeClock', () => {
  it('stands still until advanced', () => {
    const clock = new FakeClock(1000);

    expect(clock.now()).toBe(1000);
    expect(clock.now()).toBe(1000);
  });

  it('advances by milliseconds and by seconds', () => {
    const clock = new FakeClock(0);

    clock.advance(250);
    clock.advanceSeconds(2);

    expect(clock.now()).toBe(2250);
  });

  it('cannot move backwards', () => {
    expect(() => new FakeClock(0).advance(-1)).toThrow(RangeError);
  });
});

describe('ManualScheduler', () => {
  it('runs its callbacks only when ticked, and stops when cancelled', () => {
    const scheduler = new ManualScheduler();
    const callback = vi.fn();

    const cancel = scheduler.every(250, callback);
    expect(callback).not.toHaveBeenCalled();

    scheduler.tick();
    scheduler.tick();
    expect(callback).toHaveBeenCalledTimes(2);

    cancel();
    scheduler.tick();

    expect(callback).toHaveBeenCalledTimes(2);
    expect(scheduler.active).toBe(0);
  });
});

describe('intervalScheduler', () => {
  it('repeats until cancelled', async () => {
    const callback = vi.fn();
    const cancel = intervalScheduler.every(5, callback);

    await new Promise((resolve) => setTimeout(resolve, 60));
    cancel();

    const calls = callback.mock.calls.length;
    expect(calls).toBeGreaterThanOrEqual(2);

    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(callback).toHaveBeenCalledTimes(calls);
  });
});
