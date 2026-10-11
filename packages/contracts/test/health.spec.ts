import { describe, expect, it } from 'vitest';
import { healthResponseSchema, readyResponseSchema } from '../src/index.js';

const base = {
  status: 'ok',
  service: 'athar-api',
  version: '0.1.0',
  timestamp: '2026-01-01T00:00:00.000Z',
  uptimeSeconds: 12,
};

const ready = {
  ...base,
  tableMode: 'simulation',
  checks: [{ name: 'table-driver', status: 'ok' }],
};

describe('readiness response', () => {
  it('names the table mode', () => {
    expect(readyResponseSchema.parse(ready).tableMode).toBe('simulation');
    expect(readyResponseSchema.safeParse({ ...ready, tableMode: 'hardware' }).success).toBe(true);
  });

  it('requires it, and only the two known modes', () => {
    const { tableMode: _tableMode, ...without } = ready;

    expect(readyResponseSchema.safeParse(without).success).toBe(false);
    expect(readyResponseSchema.safeParse({ ...ready, tableMode: 'real' }).success).toBe(false);
    expect(readyResponseSchema.safeParse({ ...ready, tableMode: null }).success).toBe(false);
  });

  it('still accepts every probe result', () => {
    const checks = [
      { name: 'configuration', status: 'ok' },
      { name: 'event-loop', status: 'ok' },
      { name: 'table-driver', status: 'error' },
    ];

    expect(readyResponseSchema.safeParse({ ...ready, status: 'error', checks }).success).toBe(true);
  });
});

describe('liveness response', () => {
  it('is unchanged: it knows nothing about tables', () => {
    const liveness = healthResponseSchema.parse({ ...base, tableMode: 'simulation' });

    expect(Object.keys(liveness).sort()).toStrictEqual([
      'service',
      'status',
      'timestamp',
      'uptimeSeconds',
      'version',
    ]);
  });
});
