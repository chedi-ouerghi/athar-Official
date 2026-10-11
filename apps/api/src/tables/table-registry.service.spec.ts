import { Logger } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tableIdSchema } from '@athar/contracts';
import { DomainException } from '../common/http/domain.exception.js';
import { FakeClock } from '../device/fake-clock.js';
import { InMemoryTableRepository } from './in-memory-table.repository.js';
import { generateTableId } from './table-id.js';
import { TableRegistry } from './table-registry.service.js';

const START = '2026-01-01T00:00:00.000Z';

function setup(options: { baseUrl?: string; ids?: string[] } = {}) {
  const clock = new FakeClock(Date.parse(START));
  const repository = new InMemoryTableRepository();
  const queue = options.ids === undefined ? undefined : [...options.ids];
  const registry = new TableRegistry(
    repository,
    { publicLinkBaseUrl: options.baseUrl },
    clock,
    queue === undefined ? generateTableId : () => queue.shift() ?? 'exhausted-id-supply',
  );

  return { clock, repository, registry };
}

const NEW_TABLE = { displayName: 'Main hall', location: 'Ground floor', enabled: true };

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  return promise.then(
    () => undefined,
    (error: unknown) => error,
  );
}

describe('TableRegistry', () => {
  beforeAll(() => Logger.overrideLogger(false));
  afterAll(() => Logger.overrideLogger(['log', 'error', 'warn']));

  describe('create', () => {
    it('registers a table under a generated id, stamped with the clock', async () => {
      const { registry, repository } = setup();

      const table = await registry.create(NEW_TABLE);

      expect(tableIdSchema.safeParse(table.id).success).toBe(true);
      expect(table).toStrictEqual({
        ...NEW_TABLE,
        id: table.id,
        createdAt: START,
        updatedAt: START,
      });
      expect(await repository.get(table.id)).toStrictEqual(table);
    });

    it('keeps enabled false when asked', async () => {
      const { registry } = setup();

      expect((await registry.create({ ...NEW_TABLE, enabled: false })).enabled).toBe(false);
    });

    it('gives every table its own id', async () => {
      const { registry } = setup();

      const ids = await Promise.all(Array.from({ length: 20 }, () => registry.create(NEW_TABLE)));

      expect(new Set(ids.map((table) => table.id)).size).toBe(20);
    });

    it('generates a new id when the first is taken, and stores nothing twice', async () => {
      const { registry, repository } = setup({ ids: ['taken-id', 'taken-id', 'fresh-id'] });

      await registry.create(NEW_TABLE);
      const second = await registry.create(NEW_TABLE);

      expect(second.id).toBe('fresh-id');
      expect((await repository.list()).map((table) => table.id)).toStrictEqual([
        'taken-id',
        'fresh-id',
      ]);
    });

    it('gives up, with a plain error, if it keeps drawing taken ids', async () => {
      const { registry } = setup({ ids: Array.from({ length: 12 }, () => 'always-taken') });
      await registry.create(NEW_TABLE);

      await expect(registry.create(NEW_TABLE)).rejects.toThrow('unused table id');
    });
  });

  describe('get and list', () => {
    it('lists tables oldest first', async () => {
      const { registry } = setup({ ids: ['table-a1', 'table-b2'] });
      await registry.create(NEW_TABLE);
      await registry.create({ ...NEW_TABLE, displayName: 'Second' });

      expect((await registry.list()).map((table) => table.id)).toStrictEqual([
        'table-a1',
        'table-b2',
      ]);
    });

    it('throws TABLE_NOT_FOUND for an unknown id', async () => {
      const { registry } = setup();

      const failure = await failureOf(registry.get('nope-nope'));

      expect(failure).toBeInstanceOf(DomainException);
      expect((failure as DomainException).code).toBe('TABLE_NOT_FOUND');
      expect((failure as DomainException).getStatus()).toBe(404);
    });
  });

  describe('update', () => {
    it('changes only what the patch names, and moves updatedAt but not createdAt', async () => {
      const { registry, clock } = setup({ ids: ['table-a1'] });
      await registry.create(NEW_TABLE);
      clock.advanceSeconds(60);

      const updated = await registry.update('table-a1', { location: 'Upstairs' });

      expect(updated).toStrictEqual({
        id: 'table-a1',
        displayName: 'Main hall',
        location: 'Upstairs',
        enabled: true,
        createdAt: START,
        updatedAt: '2026-01-01T00:01:00.000Z',
      });
    });

    it('can switch a table off and on again', async () => {
      const { registry } = setup({ ids: ['table-a1'] });
      await registry.create(NEW_TABLE);

      expect((await registry.update('table-a1', { enabled: false })).enabled).toBe(false);
      expect((await registry.update('table-a1', { enabled: true })).enabled).toBe(true);
    });

    it('throws TABLE_NOT_FOUND for an unknown id', async () => {
      const { registry } = setup();

      const failure = await failureOf(registry.update('nope-nope', { enabled: false }));

      expect((failure as DomainException).code).toBe('TABLE_NOT_FOUND');
    });
  });

  describe('linkFor', () => {
    it('builds <origin>/t/<id> for a registered table', async () => {
      const { registry } = setup({ baseUrl: 'https://app.athar.example', ids: ['table-a1'] });
      await registry.create(NEW_TABLE);

      expect(await registry.linkFor('table-a1')).toBe('https://app.athar.example/t/table-a1');
    });

    it('falls back to athar:// with no origin configured', async () => {
      const { registry } = setup({ ids: ['table-a1'] });
      await registry.create(NEW_TABLE);

      expect(await registry.linkFor('table-a1')).toBe('athar://t/table-a1');
    });

    it('does not build a link for a table that does not exist', async () => {
      const { registry } = setup({ baseUrl: 'https://app.athar.example' });

      expect(((await failureOf(registry.linkFor('nope-nope'))) as DomainException).code).toBe(
        'TABLE_NOT_FOUND',
      );
    });
  });
});
