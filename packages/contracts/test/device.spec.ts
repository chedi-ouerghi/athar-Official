import { describe, expect, it } from 'vitest';
import { driverStatusSchema, tableModeSchema } from '../src/index.js';

const status = {
  tableId: 'table-001',
  mode: 'simulation',
  connection: 'online',
  phase: 'idle',
  jobId: null,
  progress: 0,
  errorCode: null,
  observedAt: '2026-01-01T00:00:00.000Z',
};

describe('driver status', () => {
  it('accepts a status for each mode', () => {
    expect(driverStatusSchema.safeParse(status).success).toBe(true);
    expect(driverStatusSchema.safeParse({ ...status, mode: 'hardware' }).success).toBe(true);
  });

  it('requires mode: there is no mode-less status', () => {
    const { mode: _mode, ...withoutMode } = status;

    expect(driverStatusSchema.safeParse(withoutMode).success).toBe(false);
    expect(driverStatusSchema.safeParse({ ...status, mode: null }).success).toBe(false);
  });

  it('rejects a mode other than simulation or hardware', () => {
    expect(driverStatusSchema.safeParse({ ...status, mode: 'real' }).success).toBe(false);
    expect(driverStatusSchema.safeParse({ ...status, mode: 'Simulation' }).success).toBe(false);
  });

  it('keeps progress within 0..1', () => {
    expect(driverStatusSchema.safeParse({ ...status, progress: 1 }).success).toBe(true);
    expect(driverStatusSchema.safeParse({ ...status, progress: 1.1 }).success).toBe(false);
    expect(driverStatusSchema.safeParse({ ...status, progress: -0.1 }).success).toBe(false);
  });

  it('only knows the two table modes', () => {
    expect(tableModeSchema.options).toStrictEqual(['simulation', 'hardware']);
  });
});
