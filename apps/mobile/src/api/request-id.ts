/**
 * Random identifiers for the app: the `x-request-id` correlation header, and the
 * client request id that makes a start request idempotent.
 *
 * Both are version 4 UUIDs. The API validates the second one strictly (version
 * and variant bits), so a "random-looking string" is not good enough.
 */

/** Source of random bytes, injectable so the format can be tested exactly. */
export type RandomBytes = (length: number) => Uint8Array;

function defaultRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }

  // Not every React Native engine ships `crypto`. A request id is a correlation
  // label, not a credential, so a weaker source is acceptable as a fallback.
  for (let index = 0; index < length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }

  return bytes;
}

/** A random RFC 4122 version 4 UUID, lowercase. */
export function createUuid(randomBytes: RandomBytes = defaultRandomBytes): string {
  const bytes = randomBytes(16);

  // Version 4 in the high nibble of byte 6, variant 10xx in the top bits of byte 8.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'));

  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}
