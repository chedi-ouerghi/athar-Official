import { describe, expect, it } from 'vitest';
import { apiErrorCodeSchema, apiErrorResponseSchema } from '../src/index.js';

function envelope(code: string) {
  return apiErrorResponseSchema.safeParse({
    error: { code, message: 'm', requestId: 'r', timestamp: '2026-01-01T00:00:00.000Z' },
  });
}

describe('API error codes', () => {
  it('includes UNAUTHORIZED for the admin endpoints', () => {
    expect(apiErrorCodeSchema.safeParse('UNAUTHORIZED').success).toBe(true);
    expect(envelope('UNAUTHORIZED').success).toBe(true);
  });

  it('keeps every code that existed before the domain additions', () => {
    for (const code of [
      'BAD_REQUEST',
      'NOT_FOUND',
      'VALIDATION_FAILED',
      'INTERNAL_SERVER_ERROR',
      'SERVICE_UNAVAILABLE',
    ]) {
      expect(envelope(code).success).toBe(true);
    }
  });

  it('accepts every domain code', () => {
    for (const code of [
      'TABLE_NOT_FOUND',
      'DESIGN_NOT_FOUND',
      'JOB_NOT_FOUND',
      'TABLE_DISABLED',
      'TABLE_OFFLINE',
      'TABLE_BUSY',
      'INVALID_TRANSITION',
      'IDEMPOTENCY_CONFLICT',
    ]) {
      expect(envelope(code).success).toBe(true);
    }
  });

  it('rejects an unknown code', () => {
    expect(envelope('FORBIDDEN_FOR_NO_REASON').success).toBe(false);
  });

  it('has no duplicate codes', () => {
    const codes = apiErrorCodeSchema.options;

    expect(new Set(codes).size).toBe(codes.length);
  });
});
