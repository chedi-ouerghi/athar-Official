import { Inject, Injectable } from '@nestjs/common';
import { DomainException } from '../common/http/domain.exception.js';
import { CLOCK, type Clock } from '../device/clock.js';

/** At most `max` attempts per `windowMs` for one key. */
export interface ThrottleRule {
  readonly key: string;
  readonly max: number;
  readonly windowMs: number;
}

const MINUTE = 60_000;

/**
 * The limits on sign-in and activation (`kind` keeps the two apart):
 *
 * - 5 failures per email and IP in 15 minutes: one guesser at one account;
 * - 20 failures per email in an hour, from any IP: a distributed guesser;
 * - 30 attempts per IP in 15 minutes, across all emails: one address spraying
 *   many accounts. This one counts successes too and is never cleared.
 */
export function signInRules(kind: string, email: string, ip: string): ThrottleRule[] {
  return [
    { key: `${kind}:email-ip:${email}|${ip}`, max: 5, windowMs: 15 * MINUTE },
    { key: `${kind}:email:${email}`, max: 20, windowMs: 60 * MINUTE },
    { key: `${kind}:ip:${ip}`, max: 30, windowMs: 15 * MINUTE },
  ];
}

/** Keys of {@link signInRules} that a success clears (not the per-IP one). */
export function clearedOnSuccess(rules: readonly ThrottleRule[]): string[] {
  return rules.slice(0, 2).map((rule) => rule.key);
}

/** Keys kept at most; when full, the least recently touched key is dropped. */
export const MAX_KEYS = 10_000;

/**
 * Attempt counters. An attempt is **reserved before any await**, so concurrent
 * requests cannot all slip past the check while the first is still hashing; a
 * success then clears what it reserved.
 *
 * shortcut: in-memory and per-process, reset on restart; move to the shared store with Postgres.
 */
@Injectable()
export class LoginThrottle {
  private readonly attempts = new Map<string, number[]>();

  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  /**
   * Count one attempt against every rule, or none if any rule is used up.
   *
   * @throws DomainException TOO_MANY_REQUESTS when a rule is used up.
   */
  reserve(rules: readonly ThrottleRule[]): void {
    const now = this.clock.now();
    const recent = rules.map((rule) =>
      (this.attempts.get(rule.key) ?? []).filter((at) => at > now - rule.windowMs),
    );

    if (rules.some((rule, index) => (recent[index]?.length ?? 0) >= rule.max)) {
      throw new DomainException(
        'TOO_MANY_REQUESTS',
        'Too many failed attempts. Try again in a few minutes.',
      );
    }

    rules.forEach((rule, index) => {
      // Delete first, so iteration order is "least recently touched first".
      this.attempts.delete(rule.key);

      if (this.attempts.size >= MAX_KEYS) {
        const oldest = this.attempts.keys().next().value;
        if (oldest !== undefined) {
          this.attempts.delete(oldest);
        }
      }

      this.attempts.set(rule.key, [...(recent[index] ?? []), now]);
    });
  }

  clear(keys: readonly string[]): void {
    for (const key of keys) {
      this.attempts.delete(key);
    }
  }

  /** How many keys are held, for tests. */
  get size(): number {
    return this.attempts.size;
  }
}
