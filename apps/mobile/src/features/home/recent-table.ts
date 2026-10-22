import { readSettings, writeSettings } from '../../settings/settings-storage';

/** The last table the user opened, so the home screen can offer to go back to it. */
export interface RecentTable {
  readonly id: string;
  readonly name: string;
}

export function readRecentTable(): RecentTable | undefined {
  const stored = readSettings().recentTable;

  if (typeof stored !== 'object' || stored === null) {
    return undefined;
  }

  const { id, name } = stored as { id?: unknown; name?: unknown };

  return typeof id === 'string' && id !== '' && typeof name === 'string' ? { id, name } : undefined;
}

export function storeRecentTable(table: RecentTable): void {
  writeSettings({ recentTable: { id: table.id, name: table.name } });
}
