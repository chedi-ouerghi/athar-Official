import { describe, expect, it } from 'vitest';
import {
  adminTableSchema,
  createTableRequestSchema,
  listAdminTablesResponseSchema,
  tableQrResponseSchema,
  updateTableRequestSchema,
} from '../src/index.js';

const stored = {
  id: 'k7q3x9m2d8r5t6w4',
  displayName: 'Main hall',
  location: 'Ground floor',
  enabled: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('create table request', () => {
  it('defaults enabled to true', () => {
    const parsed = createTableRequestSchema.parse({ displayName: 'Hall', location: 'Floor 1' });

    expect(parsed).toStrictEqual({ displayName: 'Hall', location: 'Floor 1', enabled: true });
  });

  it('keeps an explicit enabled value', () => {
    const parsed = createTableRequestSchema.parse({
      displayName: 'Hall',
      location: 'Floor 1',
      enabled: false,
    });

    expect(parsed.enabled).toBe(false);
  });

  it('trims text and rejects blank or oversized values', () => {
    expect(
      createTableRequestSchema.parse({ displayName: '  Hall  ', location: ' Floor 1 ' }),
    ).toMatchObject({ displayName: 'Hall', location: 'Floor 1' });
    expect(createTableRequestSchema.safeParse({ displayName: '   ', location: 'x' }).success).toBe(
      false,
    );
    expect(createTableRequestSchema.safeParse({ displayName: 'x', location: '' }).success).toBe(
      false,
    );
    expect(
      createTableRequestSchema.safeParse({ displayName: 'x'.repeat(101), location: 'x' }).success,
    ).toBe(false);
  });

  it('requires displayName and location', () => {
    expect(createTableRequestSchema.safeParse({ location: 'x' }).success).toBe(false);
    expect(createTableRequestSchema.safeParse({ displayName: 'x' }).success).toBe(false);
  });

  it('never lets the caller choose the id', () => {
    const parsed = createTableRequestSchema.parse({
      id: 'chosen-by-caller',
      displayName: 'Hall',
      location: 'Floor 1',
    });

    expect(parsed).not.toHaveProperty('id');
  });
});

describe('update table request', () => {
  it('accepts any single field', () => {
    expect(updateTableRequestSchema.safeParse({ displayName: 'New' }).success).toBe(true);
    expect(updateTableRequestSchema.safeParse({ location: 'New' }).success).toBe(true);
    expect(updateTableRequestSchema.safeParse({ enabled: false }).success).toBe(true);
  });

  it('rejects an empty patch', () => {
    expect(updateTableRequestSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a patch that contains only unknown keys', () => {
    expect(updateTableRequestSchema.safeParse({ id: 'other-id', mode: 'hardware' }).success).toBe(
      false,
    );
  });

  it('strips the id and other unknown keys from a valid patch', () => {
    const parsed = updateTableRequestSchema.parse({ enabled: true, id: 'other-id' });

    expect(parsed).toStrictEqual({ enabled: true });
  });

  it('still validates the fields it does receive', () => {
    expect(updateTableRequestSchema.safeParse({ displayName: '' }).success).toBe(false);
    expect(updateTableRequestSchema.safeParse({ enabled: 'yes' }).success).toBe(false);
  });
});

describe('admin table', () => {
  it('accepts a stored table with a valid server-generated id', () => {
    expect(adminTableSchema.safeParse(stored).success).toBe(true);
  });

  it('rejects an id that does not match the table-id schema', () => {
    expect(adminTableSchema.safeParse({ ...stored, id: 'Not Valid' }).success).toBe(false);
  });

  it('carries no live driver state', () => {
    const parsed = adminTableSchema.parse({ ...stored, mode: 'hardware', connection: 'online' });

    expect(parsed).not.toHaveProperty('mode');
    expect(parsed).not.toHaveProperty('connection');
  });

  it('lists tables', () => {
    expect(listAdminTablesResponseSchema.safeParse({ tables: [stored] }).success).toBe(true);
    expect(listAdminTablesResponseSchema.safeParse({ tables: [] }).success).toBe(true);
  });
});

describe('table QR response', () => {
  it('accepts an https link and the development scheme link', () => {
    expect(
      tableQrResponseSchema.safeParse({
        tableId: stored.id,
        link: `https://app.athar.example/t/${stored.id}`,
      }).success,
    ).toBe(true);
    expect(
      tableQrResponseSchema.safeParse({ tableId: stored.id, link: `athar://t/${stored.id}` })
        .success,
    ).toBe(true);
  });

  it('rejects a missing link or an invalid table id', () => {
    expect(tableQrResponseSchema.safeParse({ tableId: stored.id }).success).toBe(false);
    expect(
      tableQrResponseSchema.safeParse({ tableId: 'BAD', link: 'https://app.athar.example/t/x' })
        .success,
    ).toBe(false);
    expect(tableQrResponseSchema.safeParse({ tableId: stored.id, link: 'not a url' }).success).toBe(
      false,
    );
  });

  it('exposes only the id and the link: no token or signature field', () => {
    const parsed = tableQrResponseSchema.parse({
      tableId: stored.id,
      link: `https://app.athar.example/t/${stored.id}`,
      token: 'secret',
      signature: 'sig',
    });

    expect(Object.keys(parsed).sort()).toStrictEqual(['link', 'tableId']);
  });
});
