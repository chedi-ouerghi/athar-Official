/**
 * Secrets handed to clients: session tokens and activation codes. Only their
 * SHA-256 is ever stored, and stored hashes are compared in constant time.
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 256 random bits, URL-safe. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Hex SHA-256 of a secret, the only form in which it is stored. */
export function sha256(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}

/** Constant-time equality of two hashes (strings of equal length; unequal lengths are unequal). */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');

  return left.length === right.length && timingSafeEqual(left, right);
}

/** 32 symbols, none easily confused (no I, O, 0, 1): 5 bits each. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ACTIVATION_CODE_LENGTH = 10;

/** A one-time activation code, 10 characters (50 bits), typed by hand. */
export function newActivationCode(): string {
  return [...randomBytes(ACTIVATION_CODE_LENGTH)]
    .map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length])
    .join('');
}
