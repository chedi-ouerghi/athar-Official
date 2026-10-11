import { startJobRequestSchema } from '@athar/contracts';
import { describe, expect, it } from 'vitest';
import { createUuid } from './request-id';

describe('createUuid', () => {
  it('produces a version 4 UUID the API accepts as a client request id', () => {
    for (let i = 0; i < 200; i += 1) {
      const id = createUuid();

      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(
        startJobRequestSchema.safeParse({ designId: 'dunes', clientRequestId: id }).success,
      ).toBe(true);
    }
  });

  it('sets the version and variant bits whatever the random bytes are', () => {
    expect(createUuid(() => new Uint8Array(16).fill(0xff))).toBe(
      'ffffffff-ffff-4fff-bfff-ffffffffffff',
    );
    expect(createUuid(() => new Uint8Array(16))).toBe('00000000-0000-4000-8000-000000000000');
  });

  it('differs between calls', () => {
    expect(createUuid()).not.toBe(createUuid());
  });
});
