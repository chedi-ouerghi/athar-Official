import {
  TableAlreadyExistsError,
  applyPatch,
  type TablePatch,
  type TableRecord,
  type TableRepository,
} from './table-repository.js';

/**
 * Tables held in memory. Used by tests, seeded from fixtures, so no test
 * touches the file system. It implements the same interface as the JSON-file
 * repository, and the repository contract tests run against both.
 */
export class InMemoryTableRepository implements TableRepository {
  private readonly records = new Map<string, TableRecord>();

  constructor(seed: readonly TableRecord[] = []) {
    for (const record of seed) {
      this.records.set(record.id, { ...record });
    }
  }

  list(): Promise<readonly TableRecord[]> {
    return Promise.resolve([...this.records.values()].map((record) => ({ ...record })));
  }

  get(tableId: string): Promise<TableRecord | undefined> {
    const record = this.records.get(tableId);

    return Promise.resolve(record === undefined ? undefined : { ...record });
  }

  create(record: TableRecord): Promise<void> {
    if (this.records.has(record.id)) {
      return Promise.reject(new TableAlreadyExistsError(record.id));
    }

    this.records.set(record.id, { ...record });

    return Promise.resolve();
  }

  update(tableId: string, patch: TablePatch): Promise<TableRecord | undefined> {
    const existing = this.records.get(tableId);

    if (existing === undefined) {
      return Promise.resolve(undefined);
    }

    const updated = applyPatch(existing, patch);
    this.records.set(tableId, updated);

    return Promise.resolve({ ...updated });
  }
}
