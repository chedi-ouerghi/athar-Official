import { describe, expect, it } from 'vitest';
import { ACTIVATION_CODE_LENGTH, newActivationCode, newToken, safeEqual, sha256 } from './token.js';

describe('tokens', () => {
  it('are 32 random bytes, base64url', () => {
    const token = newToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(newToken()).not.toBe(token);
  });

  it('hash to a stable SHA-256 hex digest', () => {
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256('abc')).toBe(sha256('abc'));
    expect(sha256('abd')).not.toBe(sha256('abc'));
  });
});

describe('safeEqual', () => {
  it('compares equal-length values', () => {
    expect(safeEqual(sha256('a'), sha256('a'))).toBe(true);
    expect(safeEqual(sha256('a'), sha256('b'))).toBe(false);
  });

  it('treats different lengths as unequal instead of throwing', () => {
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', 'a')).toBe(false);
  });
});

describe('activation codes', () => {
  it('are 10 characters with no easily confused ones', () => {
    for (let index = 0; index < 200; index += 1) {
      const code = newActivationCode();

      expect(code).toHaveLength(ACTIVATION_CODE_LENGTH);
      expect(code).toMatch(/^[A-HJ-NP-Z2-9]+$/);
    }
  });
});
