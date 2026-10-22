import type { TableRecord } from '../src/tables/table-repository.js';

/** An enabled table, as a visitor would find it. */
export const ENABLED_TABLE: TableRecord = {
  id: 'table-001',
  displayName: 'Main hall',
  location: 'Ground floor',
  enabled: true,
  ownerAccountId: null,
  plan: 'basic',
  voiceAssistant: false,
  geometry: { shape: 'rectangle', widthMm: 1200, heightMm: 800 },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

/** A table an operator has switched off. */
export const DISABLED_TABLE: TableRecord = {
  id: 'table-off',
  displayName: 'Workshop',
  location: 'Basement',
  enabled: false,
  ownerAccountId: null,
  plan: 'basic',
  voiceAssistant: false,
  geometry: { shape: 'round', widthMm: 900, heightMm: 900 },
  createdAt: '2026-01-02T00:00:00.000Z',
  updatedAt: '2026-01-02T00:00:00.000Z',
};

export function fixtureTables(): TableRecord[] {
  return [{ ...ENABLED_TABLE }, { ...DISABLED_TABLE }];
}
