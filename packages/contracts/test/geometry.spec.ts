import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TABLE_GEOMETRY,
  TABLE_DIMENSION_MAX_MM,
  TABLE_DIMENSION_MIN_MM,
  adminTableSchema,
  createTableRequestSchema,
  polarToTableMm,
  tableGeometrySchema,
  tableProportions,
  updateTableRequestSchema,
} from '../src/index.js';

const ok = (geometry: unknown) => tableGeometrySchema.safeParse(geometry).success;

describe('tableGeometrySchema', () => {
  it.each([
    ['round', 800, 800],
    ['square', 600, 600],
    ['rectangle', 1200, 800],
    ['oval', 900, 600],
  ])('accepts a %s table of %i x %i mm', (shape, widthMm, heightMm) => {
    expect(ok({ shape, widthMm, heightMm })).toBe(true);
  });

  it.each(['round', 'square'])('refuses a %s table with two different sides', (shape) => {
    const result = tableGeometrySchema.safeParse({ shape, widthMm: 800, heightMm: 600 });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['heightMm']);
  });

  it.each([
    ['rectangle', 'square'],
    ['oval', 'round'],
  ])('refuses a %s table with equal sides, which is a %s one', (shape, other) => {
    const result = tableGeometrySchema.safeParse({ shape, widthMm: 700, heightMm: 700 });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain(other);
  });

  it.each([
    ['below the minimum', TABLE_DIMENSION_MIN_MM - 1],
    ['above the maximum', TABLE_DIMENSION_MAX_MM + 1],
    ['fractional', 800.5],
    ['negative', -800],
  ])('refuses a dimension that is %s', (_label, value) => {
    expect(ok({ shape: 'rectangle', widthMm: value, heightMm: 500 })).toBe(false);
  });

  it('refuses an unknown shape', () => {
    expect(ok({ shape: 'hexagon', widthMm: 800, heightMm: 600 })).toBe(false);
  });
});

describe('where geometry appears in the admin contracts', () => {
  const base = { displayName: 'Hall', location: 'Ground floor' };

  it('defaults a table registered without one, so an old tables file still loads', () => {
    const stored = adminTableSchema.parse({
      id: 'abc',
      ...base,
      enabled: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(stored.geometry).toEqual(DEFAULT_TABLE_GEOMETRY);
  });

  it('takes the placeholder on create when none is given, and the given one otherwise', () => {
    expect(createTableRequestSchema.parse(base).geometry).toEqual(DEFAULT_TABLE_GEOMETRY);

    const geometry = { shape: 'oval', widthMm: 1000, heightMm: 600 } as const;
    expect(createTableRequestSchema.parse({ ...base, geometry }).geometry).toEqual(geometry);
  });

  it('refuses an inconsistent geometry on create and update', () => {
    const geometry = { shape: 'square', widthMm: 800, heightMm: 600 };

    expect(createTableRequestSchema.safeParse({ ...base, geometry }).success).toBe(false);
    expect(updateTableRequestSchema.safeParse({ geometry }).success).toBe(false);
  });

  it('counts a geometry as a change on its own', () => {
    expect(
      updateTableRequestSchema.safeParse({
        geometry: { shape: 'round', widthMm: 900, heightMm: 900 },
      }).success,
    ).toBe(true);
  });
});

describe('polarToTableMm', () => {
  const rectangle = { widthMm: 1200, heightMm: 800 };

  it('puts the centre at the origin', () => {
    expect(polarToTableMm(1.234, 0, rectangle)).toEqual([0, 0]);
  });

  it('reaches half the width along x and half the height along y at the edge', () => {
    const [x0, y0] = polarToTableMm(0, 1, rectangle);
    const [x1, y1] = polarToTableMm(Math.PI / 2, 1, rectangle);

    expect(x0).toBeCloseTo(600);
    expect(y0).toBeCloseTo(0);
    expect(x1).toBeCloseTo(0);
    expect(y1).toBeCloseTo(400);
  });

  it('is the plain disc on a round table', () => {
    const [x, y] = polarToTableMm(Math.PI / 4, 0.5, { widthMm: 800, heightMm: 800 });

    expect(Math.hypot(x, y)).toBeCloseTo(200);
  });
});

describe('tableProportions', () => {
  it('puts the longer side at 1', () => {
    expect(tableProportions({ widthMm: 1200, heightMm: 600 })).toEqual({ x: 1, y: 0.5 });
    expect(tableProportions({ widthMm: 600, heightMm: 1200 })).toEqual({ x: 0.5, y: 1 });
    expect(tableProportions({ widthMm: 800, heightMm: 800 })).toEqual({ x: 1, y: 1 });
  });
});
