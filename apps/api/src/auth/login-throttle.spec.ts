import { describe, expect, it } from 'vitest';
import { DomainException } from '../common/http/domain.exception.js';
import { FakeClock } from '../device/fake-clock.js';
import { LoginThrottle, MAX_KEYS, clearedOnSuccess, signInRules } from './login-throttle.js';

const MINUTE = 60_000;

/** Reserve one attempt; report whether it was allowed. */
function attempt(throttle: LoginThrottle, email: string, ip: string): string {
  try {
    throttle.reserve(signInRules('login', email, ip));
    return 'allowed';
  } catch (error) {
    return error instanceof DomainException ? error.code : 'other';
  }
}

describe('LoginThrottle', () => {
  it('allows 5 attempts per email and IP, refuses the 6th, and allows again after 15 minutes', () => {
    const clock = new FakeClock();
    const throttle = new LoginThrottle(clock);

    for (let failure = 1; failure <= 5; failure += 1) {
      expect(attempt(throttle, 'a@x', 'ip')).toBe('allowed');
      clock.advanceSeconds(1);
    }

    expect(attempt(throttle, 'a@x', 'ip')).toBe('TOO_MANY_REQUESTS');
    expect(attempt(throttle, 'b@x', 'ip')).toBe('allowed');
    expect(attempt(throttle, 'a@x', 'other-ip')).toBe('allowed');

    // 1 ms before the first attempt (at 0 s; now 5 s) is 15 minutes old.
    clock.advance(15 * MINUTE - 5_001);
    expect(attempt(throttle, 'a@x', 'ip')).toBe('TOO_MANY_REQUESTS');

    clock.advance(1);
    expect(attempt(throttle, 'a@x', 'ip')).toBe('allowed');
  });

  it('allows 20 failures per email in an hour from any number of IPs', () => {
    const clock = new FakeClock();
    const throttle = new LoginThrottle(clock);

    for (let ip = 0; ip < 20; ip += 1) {
      expect(attempt(throttle, 'a@x', `ip-${ip}`)).toBe('allowed');
    }

    expect(attempt(throttle, 'a@x', 'ip-new')).toBe('TOO_MANY_REQUESTS');
    clock.advance(60 * MINUTE);
    expect(attempt(throttle, 'a@x', 'ip-new')).toBe('allowed');
  });

  it('allows 30 attempts per IP in 15 minutes across all emails, and a success does not reset it', () => {
    const throttle = new LoginThrottle(new FakeClock());

    for (let email = 0; email < 30; email += 1) {
      const rules = signInRules('login', `user-${email}@x`, 'ip');
      throttle.reserve(rules);
      throttle.clear(clearedOnSuccess(rules));
    }

    expect(attempt(throttle, 'another@x', 'ip')).toBe('TOO_MANY_REQUESTS');
    expect(attempt(throttle, 'another@x', 'other-ip')).toBe('allowed');
  });

  it('a success clears the email counters', () => {
    const throttle = new LoginThrottle(new FakeClock());

    for (let failure = 0; failure < 4; failure += 1) {
      attempt(throttle, 'a@x', 'ip');
    }
    throttle.clear(clearedOnSuccess(signInRules('login', 'a@x', 'ip')));

    for (let failure = 0; failure < 5; failure += 1) {
      expect(attempt(throttle, 'a@x', 'ip')).toBe('allowed');
    }
  });

  it('a refused attempt is not counted', () => {
    const throttle = new LoginThrottle(new FakeClock());

    for (let failure = 0; failure < 10; failure += 1) {
      attempt(throttle, 'a@x', 'ip');
    }

    // 5 counted on the IP, not 10: 25 more emails still fit under its 30.
    for (let email = 0; email < 25; email += 1) {
      expect(attempt(throttle, `user-${email}@x`, 'ip')).toBe('allowed');
    }
  });

  it(`holds at most ${MAX_KEYS} keys, dropping the least recently touched`, () => {
    const throttle = new LoginThrottle(new FakeClock());

    for (let index = 0; index < MAX_KEYS; index += 1) {
      throttle.reserve([{ key: `k${index}`, max: 1, windowMs: MINUTE }]);
    }
    throttle.reserve([{ key: 'newest', max: 1, windowMs: MINUTE }]);

    expect(throttle.size).toBe(MAX_KEYS);
    // k0 was dropped, so it can be used again; k1 is still counted.
    expect(() => throttle.reserve([{ key: 'k0', max: 1, windowMs: MINUTE }])).not.toThrow();
    expect(() => throttle.reserve([{ key: 'newest', max: 1, windowMs: MINUTE }])).toThrow();
  });
});
