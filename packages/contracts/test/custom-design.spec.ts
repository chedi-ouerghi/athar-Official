import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  DRAWING_PATH_MAX_POINTS,
  apiErrorCodeSchema,
  createCustomDesignRequestSchema,
  customDesignParamsSchema,
  customDesignSchema,
} from '../src/index.js';

const path = [
  [0, 0],
  [3.14, 1],
];

describe('custom designs', () => {
  it('a request names a path and trims the name', () => {
    expect(createCustomDesignRequestSchema.parse({ name: '  Spiral ', path }).name).toBe('Spiral');
  });

  it('rejects an empty name, a long name and a bad path', () => {
    expect(createCustomDesignRequestSchema.safeParse({ name: '  ', path }).success).toBe(false);
    expect(createCustomDesignRequestSchema.safeParse({ name: 'x'.repeat(81), path }).success).toBe(
      false,
    );
    expect(createCustomDesignRequestSchema.safeParse({ name: 'a', path: [[0, 0]] }).success).toBe(
      false,
    );
    expect(
      createCustomDesignRequestSchema.safeParse({
        name: 'a',
        path: [
          [0, 0],
          [1, 2],
        ],
      }).success,
    ).toBe(false);
    expect(
      createCustomDesignRequestSchema.safeParse({
        name: 'a',
        path: Array.from({ length: DRAWING_PATH_MAX_POINTS + 1 }, () => [0, 0.5]),
      }).success,
    ).toBe(false);
  });

  it('a saved design has a UUID and a creation time', () => {
    expect(
      customDesignSchema.safeParse({
        id: randomUUID(),
        name: 'Spiral',
        path,
        createdAt: '2026-10-21T13:00:00.000Z',
      }).success,
    ).toBe(true);
    expect(customDesignParamsSchema.safeParse({ designId: 'spiral' }).success).toBe(false);
  });
});

describe('error codes for pairing and designs', () => {
  it.each(['PAIRING_TOKEN_INVALID', 'TABLE_ALREADY_CLAIMED', 'DESIGN_READ_ONLY'])(
    '%s exists',
    (code) => {
      expect(apiErrorCodeSchema.safeParse(code).success).toBe(true);
    },
  );
});
