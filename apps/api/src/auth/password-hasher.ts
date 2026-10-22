/**
 * Password hashing with `node:crypto` scrypt: a 16-byte salt, a 64-byte key,
 * N=2^15, r=8, p=1. Stored as `scrypt$<N>$<r>$<p>$<salt base64>$<hash base64>`,
 * so the parameters can be raised later without breaking existing hashes (the
 * first build used N=2^14, which still verifies).
 *
 * At most {@link MAX_CONCURRENT_HASHES} scrypt runs at once (each takes 32 MiB
 * and tens of milliseconds); the rest wait their turn.
 */

import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/** Stored parameters above these are treated as malformed: never a match, never a 500. */
const MAX_N = 2 ** 17;
const MAX_R = 8;
const MAX_P = 4;

/** scrypt needs about 128 * N * r bytes; this covers the largest accepted parameters. */
const MAX_MEMORY = 256 * 1024 * 1024;

export const MAX_CONCURRENT_HASHES = 4;

let running = 0;
const waiting: (() => void)[] = [];

/** Run `task` once fewer than {@link MAX_CONCURRENT_HASHES} tasks are running. */
async function withSlot<T>(task: () => Promise<T>): Promise<T> {
  if (running < MAX_CONCURRENT_HASHES) {
    running += 1;
  } else {
    // The slot is handed over by the task that finishes.
    await new Promise<void>((resolve) => waiting.push(resolve));
  }

  try {
    return await task();
  } finally {
    const next = waiting.shift();

    if (next === undefined) {
      running -= 1;
    } else {
      next();
    }
  }
}

function derive(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return withSlot(
    () =>
      new Promise((resolve, reject) => {
        scrypt(password, salt, keyLength, { ...options, maxmem: MAX_MEMORY }, (error, key) => {
          if (error === null) {
            resolve(key);
          } else {
            reject(error);
          }
        });
      }),
  );
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt, KEY_LENGTH, { N, r: R, p: P });

  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

const inRange = (value: number, max: number) =>
  Number.isInteger(value) && value > 0 && value <= max;

/** Whether `password` matches `stored`. A malformed `stored` never matches. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash, extra] = stored.split('$');
  const [cost = 0, blockSize = 0, parallelism = 0] = [n, r, p].map(Number);

  if (
    scheme !== 'scrypt' ||
    extra !== undefined ||
    salt === undefined ||
    hash === undefined ||
    // N must be a power of two above 1.
    !(inRange(cost, MAX_N) && cost > 1 && (cost & (cost - 1)) === 0) ||
    !inRange(blockSize, MAX_R) ||
    !inRange(parallelism, MAX_P)
  ) {
    return false;
  }

  const expected = Buffer.from(hash, 'base64');

  if (expected.length === 0) {
    return false;
  }

  const actual = await derive(password, Buffer.from(salt, 'base64'), expected.length, {
    N: cost,
    r: blockSize,
    p: parallelism,
  });

  return timingSafeEqual(actual, expected);
}

/**
 * A well-formed hash with the current parameters that no password matches (its
 * key is all zeros). Verifying against it costs one real scrypt, so an unknown
 * email takes as long to refuse as a wrong password.
 */
export const DUMMY_PASSWORD_HASH = `scrypt$${N}$${R}$${P}$${Buffer.alloc(SALT_LENGTH).toString('base64')}$${Buffer.alloc(KEY_LENGTH).toString('base64')}`;
