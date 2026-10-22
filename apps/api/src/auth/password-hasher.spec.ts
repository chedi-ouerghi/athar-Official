import { randomBytes, scryptSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password-hasher.js';

describe('password hasher', () => {
  it('verifies the password it hashed, and nothing else', async () => {
    const stored = await hashPassword('correct horse battery');

    expect(await verifyPassword('correct horse battery', stored)).toBe(true);
    expect(await verifyPassword('correct horse batterY', stored)).toBe(false);
    expect(await verifyPassword('', stored)).toBe(false);
  });

  it('stores scrypt$N$r$p$salt$hash with N=2^15, r=8, p=1, and never the password', async () => {
    const stored = await hashPassword('correct horse battery');
    const [scheme, n, r, p, salt, hash] = stored.split('$');

    expect([scheme, n, r, p]).toStrictEqual(['scrypt', '32768', '8', '1']);
    expect(Buffer.from(salt ?? '', 'base64')).toHaveLength(16);
    expect(Buffer.from(hash ?? '', 'base64')).toHaveLength(64);
    expect(stored).not.toContain('correct');
  });

  it('salts every hash', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it.each([
    ['empty', ''],
    ['another scheme', 'bcrypt$2b$10$abc'],
    ['missing parts', 'scrypt$16384$8$1$c2FsdA=='],
    ['extra parts', `${DUMMY_PASSWORD_HASH}$x`],
    ['a non-numeric cost', 'scrypt$x$8$1$c2FsdA==$aGFzaA=='],
    ['an empty hash', 'scrypt$16384$8$1$c2FsdA==$'],
  ])('never matches a malformed stored value: %s', async (_label, stored) => {
    expect(await verifyPassword('anything', stored)).toBe(false);
  });

  it('still verifies a hash made with N=2^14, as the first build did', async () => {
    const salt = randomBytes(16);
    const key = scryptSync('old password', salt, 64, { N: 2 ** 14, r: 8, p: 1 });
    const stored = `scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`;

    expect(await verifyPassword('old password', stored)).toBe(true);
    expect(await verifyPassword('other password', stored)).toBe(false);
  });

  it.each([
    ['N above 2^17', 2 ** 18, 8, 1],
    ['N not a power of two', 30000, 8, 1],
    ['N of 1', 1, 8, 1],
    ['r above 8', 2 ** 14, 9, 1],
    ['p above 4', 2 ** 14, 8, 5],
  ])('treats %s as malformed: a mismatch, not an error', async (_label, n, r, p) => {
    const stored = `scrypt$${n}$${r}$${p}$${Buffer.alloc(16).toString('base64')}$${Buffer.alloc(64).toString('base64')}`;

    expect(await verifyPassword('anything', stored)).toBe(false);
  });

  it('has a dummy hash that is well formed and that no password matches', async () => {
    expect(await verifyPassword('', DUMMY_PASSWORD_HASH)).toBe(false);
    expect(await verifyPassword('password', DUMMY_PASSWORD_HASH)).toBe(false);
  });
});
