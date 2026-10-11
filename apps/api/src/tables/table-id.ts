import { randomBytes } from 'node:crypto';

/** Lowercase RFC 4648 base-32: letters and the digits 2 to 7. */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

/** 10 bytes is 80 bits, which base-32 encodes as exactly 16 characters. */
const ID_BYTES = 10;

/** Source of random bytes, replaceable so a test can force a particular id. */
export type RandomBytes = (size: number) => Uint8Array;

/**
 * Generate a public table id: 80 random bits from the operating system's
 * cryptographic generator, as 16 lowercase base-32 characters, for example
 * `k7q3x9m2d8r5t6w4`.
 *
 * It matches the shared table-id schema (`[a-z0-9-]{3,40}`), so the public
 * endpoints and the mobile link parser accept it unchanged. 80 bits makes
 * enumerating ids infeasible. The id is still public, printed in a QR code, and
 * is not a credential.
 */
export function generateTableId(random: RandomBytes = randomBytes): string {
  const bytes = random(ID_BYTES);
  let bits = 0;
  let value = 0;
  let id = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      id += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }

    value &= (1 << bits) - 1;
  }

  return id;
}
