import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { DomainException } from '../common/http/domain.exception.js';
import { AdminKeyGuard, UNAUTHORIZED_MESSAGE } from './admin-key.guard.js';

const KEY = 'a-perfectly-good-admin-key-0123456789';

interface Outcome {
  readonly allowed: boolean;
  readonly code?: string;
  readonly status?: number;
  readonly message?: string;
  readonly headers: Record<string, string>;
}

/** Run the guard against a request with the given headers and report what it did. */
function run(configuredKey: string | undefined, headers: Record<string, unknown>): Outcome {
  const responseHeaders: Record<string, string> = {};
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
      getResponse: () => ({
        setHeader: (name: string, value: string) => {
          responseHeaders[name] = value;
        },
      }),
    }),
  } as unknown as ExecutionContext;

  try {
    const allowed = new AdminKeyGuard({ adminApiKey: configuredKey }).canActivate(context);

    return { allowed, headers: responseHeaders };
  } catch (error) {
    if (!(error instanceof DomainException)) {
      throw error;
    }

    return {
      allowed: false,
      code: error.code,
      status: error.getStatus(),
      message: error.message,
      headers: responseHeaders,
    };
  }
}

describe('AdminKeyGuard', () => {
  it('lets in a request with the right key', () => {
    expect(run(KEY, { authorization: `Bearer ${KEY}` })).toMatchObject({ allowed: true });
  });

  it('treats the Bearer scheme case-insensitively, as HTTP does', () => {
    expect(run(KEY, { authorization: `bearer ${KEY}` }).allowed).toBe(true);
    expect(run(KEY, { authorization: `BEARER ${KEY}` }).allowed).toBe(true);
  });

  describe('every way of failing', () => {
    const failures: [
      label: string,
      configured: string | undefined,
      headers: Record<string, unknown>,
    ][] = [
      ['no Authorization header', KEY, {}],
      ['an empty Authorization header', KEY, { authorization: '' }],
      ['a wrong key', KEY, { authorization: 'Bearer not-the-key' }],
      [
        'a key that differs only in its last character',
        KEY,
        { authorization: `Bearer ${KEY.slice(0, -1)}X` },
      ],
      [
        'a key that is a prefix of the real one',
        KEY,
        { authorization: `Bearer ${KEY.slice(0, 10)}` },
      ],
      ['a key with extra characters appended', KEY, { authorization: `Bearer ${KEY}x` }],
      ['a much longer wrong key', KEY, { authorization: `Bearer ${'x'.repeat(5000)}` }],
      ['the key without a scheme', KEY, { authorization: KEY }],
      ['the Basic scheme', KEY, { authorization: `Basic ${KEY}` }],
      ['Bearer with no token', KEY, { authorization: 'Bearer' }],
      ['Bearer with only spaces', KEY, { authorization: 'Bearer    ' }],
      ['a token with a space in it', KEY, { authorization: `Bearer ${KEY} extra` }],
      ['a non-string header value', KEY, { authorization: [`Bearer ${KEY}`] }],
      ['no key configured, and no header', undefined, {}],
      ['no key configured, and a header', undefined, { authorization: `Bearer ${KEY}` }],
      ['no key configured, and an empty bearer', undefined, { authorization: 'Bearer ' }],
    ];

    it.each(failures)('rejects %s', (_label, configured, headers) => {
      expect(run(configured, headers)).toMatchObject({
        allowed: false,
        code: 'UNAUTHORIZED',
        status: 401,
      });
    });

    it('gives one identical response for all of them', () => {
      const outcomes = failures.map(([, configured, headers]) => run(configured, headers));

      for (const outcome of outcomes) {
        expect(outcome).toStrictEqual(outcomes[0]);
      }
      expect(outcomes[0]).toStrictEqual({
        allowed: false,
        code: 'UNAUTHORIZED',
        status: 401,
        message: UNAUTHORIZED_MESSAGE,
        headers: { 'WWW-Authenticate': 'Bearer' },
      });
    });

    it('never puts the configured or the supplied key in the response', () => {
      const outcome = run(KEY, { authorization: 'Bearer supplied-secret-value' });

      expect(JSON.stringify(outcome)).not.toContain(KEY);
      expect(JSON.stringify(outcome)).not.toContain('supplied-secret-value');
    });
  });

  it('does not throw on keys of any length, which a naive timingSafeEqual would', () => {
    for (const length of [0, 1, 31, 32, 33, 1000]) {
      expect(() => run(KEY, { authorization: `Bearer ${'k'.repeat(length)}` })).not.toThrow();
    }
  });

  it('fails closed: with no key configured, nothing gets in, not even an empty key', () => {
    expect(run(undefined, { authorization: 'Bearer ' }).allowed).toBe(false);
    expect(run(undefined, { authorization: 'Bearer undefined' }).allowed).toBe(false);
    expect(run(undefined, {}).allowed).toBe(false);
  });
});
