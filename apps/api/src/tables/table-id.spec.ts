import { tableIdSchema } from '@athar/contracts';
import { describe, expect, it } from 'vitest';
import { generateTableId } from './table-id.js';

describe('generateTableId', () => {
  it('produces 16 lowercase base-32 characters that the shared table-id schema accepts', () => {
    for (let index = 0; index < 200; index += 1) {
      const id = generateTableId();

      expect(id).toMatch(/^[a-z2-7]{16}$/);
      expect(tableIdSchema.safeParse(id).success).toBe(true);
    }
  });

  it('does not repeat: 80 random bits', () => {
    const ids = new Set(Array.from({ length: 5000 }, () => generateTableId()));

    expect(ids.size).toBe(5000);
  });

  it('draws on all 80 bits: every character of the alphabet appears', () => {
    const seen = new Set(Array.from({ length: 400 }, () => generateTableId()).join(''));

    expect(seen.size).toBe(32);
  });

  it('encodes known bytes to the known RFC 4648 text, lowercased', () => {
    const bytes =
      (...values: number[]) =>
      () =>
        Uint8Array.from(values);

    // 80 zero bits, 80 one bits, and the ASCII bytes of "foobarfoob", whose first
    // characters match the RFC 4648 test vector for "foobar" (MZXW6YTBOI).
    expect(generateTableId(bytes(0, 0, 0, 0, 0, 0, 0, 0, 0, 0))).toBe('aaaaaaaaaaaaaaaa');
    expect(generateTableId(bytes(255, 255, 255, 255, 255, 255, 255, 255, 255, 255))).toBe(
      '7777777777777777',
    );
    expect(generateTableId(bytes(0x66, 0x6f, 0x6f, 0x62, 0x61, 0x72, 0x66, 0x6f, 0x6f, 0x62))).toBe(
      'mzxw6ytbojtg633c',
    );
  });

  it('uses the random source it is given, ten bytes of it', () => {
    let requested = 0;

    generateTableId((size) => {
      requested = size;
      return new Uint8Array(size);
    });

    expect(requested).toBe(10);
  });
});
