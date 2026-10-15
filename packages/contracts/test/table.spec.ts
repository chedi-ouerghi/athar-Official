import { describe, expect, it } from 'vitest';
import { TABLE_ID_PATTERN, tableIdSchema, tableSchema } from '../src/index.js';

describe('table id', () => {
  it.each(['abc', 'table-001', 'a1b2c3', '7k3q9x2m', 'a'.repeat(40)])('accepts %s', (id) => {
    expect(tableIdSchema.safeParse(id).success).toBe(true);
  });

  it.each([
    ['too short', 'ab'],
    ['too long', 'a'.repeat(41)],
    ['empty', ''],
    ['uppercase', 'Table1'],
    ['space', 'a b'],
    ['underscore', 'table_1'],
    ['slash', 'a/b'],
    ['path traversal', '../x'],
    ['query injection', 'abc?x=1'],
    ['non-ASCII', 'طاولة'],
    ['trailing newline', 'abc\n'],
  ])('rejects %s', (_label, id) => {
    expect(tableIdSchema.safeParse(id).success).toBe(false);
  });

  it('exposes the pattern the link parser can share', () => {
    expect(TABLE_ID_PATTERN.test('table-001')).toBe(true);
  });
});

describe('table', () => {
  const table = {
    id: 'table-001',
    displayName: 'Main hall',
    location: 'Ground floor',
    enabled: true,
    mode: 'simulation',
    connection: 'online',
    activeJobId: null,
    plan: 'personalized',
    voiceAssistant: true,
    features: ['catalogue', 'rake', 'drawingPen', 'ledAmbiences', 'voiceAssistant'],
  };

  it('accepts a valid table', () => {
    expect(tableSchema.safeParse(table).success).toBe(true);
  });

  it('requires a known mode and connection', () => {
    expect(tableSchema.safeParse({ ...table, mode: undefined }).success).toBe(false);
    expect(tableSchema.safeParse({ ...table, mode: 'real' }).success).toBe(false);
    expect(tableSchema.safeParse({ ...table, connection: 'sleeping' }).success).toBe(false);
  });

  it('requires the plan, the voice add-on and known features', () => {
    expect(tableSchema.safeParse({ ...table, plan: undefined }).success).toBe(false);
    expect(tableSchema.safeParse({ ...table, voiceAssistant: undefined }).success).toBe(false);
    expect(tableSchema.safeParse({ ...table, features: ['laser'] }).success).toBe(false);
  });
});
