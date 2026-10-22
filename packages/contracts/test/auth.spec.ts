import { describe, expect, it } from 'vitest';
import {
  activateRequestSchema,
  apiErrorCodeSchema,
  loginRequestSchema,
  meResponseSchema,
  refreshRequestSchema,
  sessionResponseSchema,
} from '../src/index.js';

const account = { id: 'a1', email: 'sara@example.com', displayName: 'Sara', role: 'customer' };

describe('login request', () => {
  it('trims and lowercases the email', () => {
    expect(loginRequestSchema.parse({ email: '  Sara@Example.COM ', password: 'x' })).toStrictEqual(
      { email: 'sara@example.com', password: 'x' },
    );
  });

  it.each([
    ['a missing password', { email: 'a@b.co' }],
    ['an empty password', { email: 'a@b.co', password: '' }],
    ['an oversized password', { email: 'a@b.co', password: 'x'.repeat(201) }],
    ['an invalid email', { email: 'not-an-email', password: 'x' }],
  ])('rejects %s', (_label, body) => {
    expect(loginRequestSchema.safeParse(body).success).toBe(false);
  });
});

describe('activate request', () => {
  const valid = { email: 'a@b.co', activationCode: ' abcde23456 ', password: 'long-enough-1' };

  it('normalises the code to trimmed upper case', () => {
    expect(activateRequestSchema.parse(valid).activationCode).toBe('ABCDE23456');
  });

  it('needs a password of 10 to 200 characters', () => {
    expect(activateRequestSchema.safeParse({ ...valid, password: 'x'.repeat(9) }).success).toBe(
      false,
    );
    expect(activateRequestSchema.safeParse({ ...valid, password: 'x'.repeat(10) }).success).toBe(
      true,
    );
    expect(activateRequestSchema.safeParse({ ...valid, password: 'x'.repeat(201) }).success).toBe(
      false,
    );
  });

  it('rejects a missing code', () => {
    expect(activateRequestSchema.safeParse({ ...valid, activationCode: '  ' }).success).toBe(false);
  });
});

describe('refresh request', () => {
  it('needs a token', () => {
    expect(refreshRequestSchema.safeParse({ refreshToken: 'abc' }).success).toBe(true);
    expect(refreshRequestSchema.safeParse({ refreshToken: '' }).success).toBe(false);
    expect(refreshRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('session and me responses', () => {
  it('parse a session', () => {
    const session = {
      accessToken: 't',
      accessTokenExpiresAt: '2026-01-01T00:15:00.000Z',
      refreshToken: 'r',
      refreshTokenExpiresAt: '2026-01-31T00:00:00.000Z',
      account,
    };

    expect(sessionResponseSchema.parse(session)).toStrictEqual(session);
  });

  it('strip any hash a server might leak by mistake', () => {
    expect(meResponseSchema.parse({ ...account, passwordHash: 'scrypt$...' })).toStrictEqual(
      account,
    );
  });

  it('reject an unknown role', () => {
    expect(meResponseSchema.safeParse({ ...account, role: 'root' }).success).toBe(false);
  });
});

describe('auth error codes', () => {
  it.each([
    'INVALID_CREDENTIALS',
    'SESSION_EXPIRED',
    'FORBIDDEN',
    'TOO_MANY_REQUESTS',
    'ACTIVATION_INVALID',
    'PAIRING_REQUIRED',
    'FEATURE_NOT_IN_PLAN',
  ])('includes %s', (code) => {
    expect(apiErrorCodeSchema.safeParse(code).success).toBe(true);
  });
});
