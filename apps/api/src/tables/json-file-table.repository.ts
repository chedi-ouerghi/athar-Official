/**
 * Tables persisted in one JSON file (`TABLES_DATA_FILE`).
 *
 * ```json
 * { "version": 1, "tables": [ { "id": "...", "displayName": "...", ... } ] }
 * ```
 *
 * Validation, atomic writes, the write queue and the writer lock come from
 * {@link JsonFileStore}; see its documentation for the guarantees.
 *
 * The file holds registration data only: no secrets, no personal data, no jobs.
 * It is a single-instance store; a database is an open decision.
 */

import { z } from 'zod';
import { adminTableSchema } from '@athar/contracts';
import { JsonFileStore, type FileOperations } from '../common/persistence/json-file-store.js';
import {
  TableAlreadyExistsError,
  applyPatch,
  type TablePatch,
  type TableRecord,
  type TableRepository,
} from './table-repository.js';

export type { FileOperations } from '../common/persistence/json-file-store.js';

/** The only file format version this build reads and writes. */
export const TABLES_FILE_VERSION = 1;

const tablesSchema = z.array(adminTableSchema).superRefine((tables, context) => {
  const seen = new Set<string>();

  for (const [index, table] of tables.entries()) {
    if (seen.has(table.id)) {
      context.addIssue({
        code: 'custom',
        path: [index, 'id'],
        message: `duplicate table id ${table.id}`,
      });
    }

    seen.add(table.id);
  }
});

export interface OpenOptions {
  /**
   * Open without taking the lock, creating anything, or ever writing. For tools
   * that only read the table list (the QR command).
   */
  readonly readOnly?: boolean;
  readonly fileOperations?: FileOperations;
}

export class JsonFileTableRepository implements TableRepository {
  private constructor(private readonly store: JsonFileStore<TableRecord>) {}

  /**
   * Load the file, creating it (and its directory) first if it is missing.
   *
   * @throws StartupConfigurationError if the file is unreadable, invalid, of an
   *   unknown version, or is open for writing in another process.
   */
  static async open(file: string, options: OpenOptions = {}): Promise<JsonFileTableRepository> {
    return new JsonFileTableRepository(
      await JsonFileStore.open(file, {
        ...options,
        setting: 'TABLES_DATA_FILE',
        key: 'tables',
        version: TABLES_FILE_VERSION,
        schema: tablesSchema,
        busyHint:
          'Only one process may write the tables file at a time: stop the API before running a command that changes tables, or use the admin endpoints instead.',
      }),
    );
  }

  /** Wait for pending writes, then release the lock. Safe to call twice. */
  close(): Promise<void> {
    return this.store.close();
  }

  /** Nest calls this when the application closes. */
  onModuleDestroy(): Promise<void> {
    return this.close();
  }

  list(): Promise<readonly TableRecord[]> {
    return Promise.resolve(this.store.records.map((table) => ({ ...table })));
  }

  get(tableId: string): Promise<TableRecord | undefined> {
    const table = this.store.records.find((candidate) => candidate.id === tableId);

    return Promise.resolve(table === undefined ? undefined : { ...table });
  }

  create(record: TableRecord): Promise<void> {
    return this.store.change((tables) => {
      if (tables.some((table) => table.id === record.id)) {
        throw new TableAlreadyExistsError(record.id);
      }

      return { next: [...tables, { ...record }], result: undefined };
    });
  }

  update(tableId: string, patch: TablePatch): Promise<TableRecord | undefined> {
    return this.store.change((tables) => {
      const existing = tables.find((table) => table.id === tableId);

      if (existing === undefined) {
        return { result: undefined };
      }

      const updated = applyPatch(existing, patch);

      return {
        next: tables.map((table) => (table.id === tableId ? updated : table)),
        result: { ...updated },
      };
    });
  }
}
