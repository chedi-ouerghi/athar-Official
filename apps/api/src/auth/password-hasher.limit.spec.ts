import type * as Crypto from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

/** scrypt replaced by a slow fake that records how many run at once. */
const tracker = vi.hoisted(() => ({ active: 0, peak: 0, maxmem: [] as unknown[] }));

vi.mock('node:crypto', async (importOriginal) => {
  const real = await importOriginal<typeof Crypto>();

  return {
    ...real,
    scrypt: (
      _password: string,
      _salt: Buffer,
      keyLength: number,
      options: { maxmem?: number },
      callback: (error: Error | null, key: Buffer) => void,
    ) => {
      tracker.active += 1;
      tracker.peak = Math.max(tracker.peak, tracker.active);
      tracker.maxmem.push(options.maxmem);
      setTimeout(() => {
        tracker.active -= 1;
        callback(null, Buffer.alloc(keyLength));
      }, 5);
    },
  };
});

const { MAX_CONCURRENT_HASHES, hashPassword, verifyPassword } =
  await import('./password-hasher.js');

describe('password hasher concurrency', () => {
  it('runs at most 4 scrypt operations at once, and finishes them all', async () => {
    const stored = await hashPassword('x');
    tracker.peak = 0;

    const results = await Promise.all([
      ...Array.from({ length: 10 }, () => hashPassword('a-password')),
      ...Array.from({ length: 10 }, () => verifyPassword('x', stored)),
    ]);

    expect(MAX_CONCURRENT_HASHES).toBe(4);
    expect(tracker.peak).toBe(4);
    expect(results).toHaveLength(20);
    expect(tracker.active).toBe(0);
  });

  it('always passes maxmem explicitly', () => {
    expect(tracker.maxmem.every((value) => typeof value === 'number' && value > 0)).toBe(true);
  });
});
