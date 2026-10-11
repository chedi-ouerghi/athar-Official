/**
 * Storage of registered tables, behind an interface so the JSON file used today
 * can be replaced by a database without touching the services above it
 * (docs/architecture.md, "Table persistence").
 *
 * A repository stores registration data only: id, display name, location,
 * the `enabled` switch and timestamps. Live state (mode, connection, active
 * job) is not stored; it is composed from the driver on each read.
 */

import type { AdminTable } from '@athar/contracts';

/** A table as stored. Identical to the admin view of a table. */
export type TableRecord = AdminTable;

/**
 * Fields an update may change, plus the new `updatedAt`. A field left out is
 * left alone. The id is not here: it is immutable.
 */
export type TablePatch = Partial<Pick<TableRecord, 'displayName' | 'location' | 'enabled'>> & {
  readonly updatedAt: string;
};

export interface TableRepository {
  /** Every table, oldest first. */
  list(): Promise<readonly TableRecord[]>;

  get(tableId: string): Promise<TableRecord | undefined>;

  /**
   * Store a new table.
   *
   * @throws TableAlreadyExistsError if the id is taken. The caller retries with
   *   a new id.
   */
  create(record: TableRecord): Promise<void>;

  /** Apply a patch and return the updated record, or `undefined` if there is no such table. */
  update(tableId: string, patch: TablePatch): Promise<TableRecord | undefined>;
}

/** Dependency-injection token for the {@link TableRepository}. */
export const TABLE_REPOSITORY = Symbol('TABLE_REPOSITORY');

export class TableAlreadyExistsError extends Error {
  constructor(readonly tableId: string) {
    super(`A table with id ${tableId} already exists.`);
    this.name = 'TableAlreadyExistsError';
  }
}

/** Apply a patch to a record, ignoring fields the patch does not mention. */
export function applyPatch(record: TableRecord, patch: TablePatch): TableRecord {
  return {
    ...record,
    displayName: patch.displayName ?? record.displayName,
    location: patch.location ?? record.location,
    enabled: patch.enabled ?? record.enabled,
    updatedAt: patch.updatedAt,
  };
}
