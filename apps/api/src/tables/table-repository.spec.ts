import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DISABLED_TABLE, ENABLED_TABLE } from '../../test/table-fixtures.js';
import { InMemoryTableRepository } from './in-memory-table.repository.js';
import { JsonFileTableRepository } from './json-file-table.repository.js';
import {
  TableAlreadyExistsError,
  type TableRecord,
  type TableRepository,
} from './table-repository.js';

/**
 * One contract, two implementations: everything the services rely on is
 * asserted against both, so the in-memory repository used by tests cannot drift
 * from the JSON-file repository used in production.
 */
interface Subject {
  readonly repository: TableRepository;
  readonly cleanup: () => Promise<void>;
}

const implementations: [name: string, make: (seed: readonly TableRecord[]) => Promise<Subject>][] =
  [
    [
      'InMemoryTableRepository',
      (seed) =>
        Promise.resolve({
          repository: new InMemoryTableRepository(seed),
          cleanup: () => Promise.resolve(),
        }),
    ],
    [
      'JsonFileTableRepository',
      async (seed) => {
        const directory = await mkdtemp(join(tmpdir(), 'athar-tables-'));
        const repository = await JsonFileTableRepository.open(join(directory, 'tables.json'));

        for (const record of seed) {
          await repository.create(record);
        }

        return {
          repository,
          cleanup: async () => {
            await repository.close();
            await rm(directory, { recursive: true, force: true });
          },
        };
      },
    ],
  ];

describe.each(implementations)('%s (repository contract)', (_name, make) => {
  let subject: Subject;
  let repository: TableRepository;

  beforeEach(async () => {
    subject = await make([ENABLED_TABLE, DISABLED_TABLE]);
    repository = subject.repository;
  });

  afterEach(async () => {
    await subject.cleanup();
  });

  it('lists tables oldest first, in the order they were added', async () => {
    await repository.create({ ...ENABLED_TABLE, id: 'table-new' });

    expect((await repository.list()).map((table) => table.id)).toStrictEqual([
      'table-001',
      'table-off',
      'table-new',
    ]);
  });

  it('gets a table by id, and answers undefined for an unknown one', async () => {
    expect(await repository.get('table-001')).toStrictEqual(ENABLED_TABLE);
    expect(await repository.get('nope')).toBeUndefined();
  });

  it('refuses to create a table whose id is taken, and leaves the original alone', async () => {
    await expect(
      repository.create({ ...ENABLED_TABLE, displayName: 'Impostor' }),
    ).rejects.toBeInstanceOf(TableAlreadyExistsError);

    expect((await repository.get('table-001'))?.displayName).toBe('Main hall');
    expect(await repository.list()).toHaveLength(2);
  });

  it('updates only the fields in the patch, and sets updatedAt', async () => {
    const updated = await repository.update('table-001', {
      enabled: false,
      updatedAt: '2026-02-02T00:00:00.000Z',
    });

    expect(updated).toStrictEqual({
      ...ENABLED_TABLE,
      enabled: false,
      updatedAt: '2026-02-02T00:00:00.000Z',
    });
    expect(await repository.get('table-001')).toStrictEqual(updated);
  });

  it('can update every editable field at once', async () => {
    const updated = await repository.update('table-001', {
      displayName: 'Renamed',
      location: 'Moved',
      enabled: false,
      updatedAt: '2026-03-03T00:00:00.000Z',
    });

    expect(updated).toMatchObject({ displayName: 'Renamed', location: 'Moved', enabled: false });
  });

  it('never changes id or createdAt', async () => {
    const updated = await repository.update('table-001', {
      displayName: 'Renamed',
      updatedAt: '2026-03-03T00:00:00.000Z',
    });

    expect(updated?.id).toBe('table-001');
    expect(updated?.createdAt).toBe(ENABLED_TABLE.createdAt);
  });

  it('answers undefined when updating an unknown table', async () => {
    expect(
      await repository.update('nope', { enabled: true, updatedAt: '2026-02-02T00:00:00.000Z' }),
    ).toBeUndefined();
  });

  it('returns copies, so callers cannot change stored records', async () => {
    const first = await repository.get('table-001');
    if (first === undefined) {
      throw new Error('fixture missing');
    }
    first.displayName = 'Tampered';
    (await repository.list())[0]!.displayName = 'Tampered';

    expect((await repository.get('table-001'))?.displayName).toBe('Main hall');
  });

  it('keeps the other tables untouched by an update', async () => {
    await repository.update('table-001', { enabled: false, updatedAt: '2026-02-02T00:00:00.000Z' });

    expect(await repository.get('table-off')).toStrictEqual(DISABLED_TABLE);
  });
});
