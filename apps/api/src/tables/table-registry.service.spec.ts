import { Logger } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { tableIdSchema } from '@athar/contracts';
import { DomainException } from '../common/http/domain.exception.js';
import { FakeClock } from '../device/fake-clock.js';
import type { GuestLookup } from './guest-lookup.js';
import { InMemoryTableRepository } from './in-memory-table.repository.js';
import { generateTableId } from './table-id.js';
import { TableRegistry } from './table-registry.service.js';

const START = '2026-01-01T00:00:00.000Z';

function setup(options: { baseUrl?: string; ids?: string[]; guests?: GuestLookup } = {}) {
  const clock = new FakeClock(Date.parse(START));
  const repository = new InMemoryTableRepository();
  const queue = options.ids === undefined ? undefined : [...options.ids];
  const registry = new TableRegistry(
    repository,
    { publicLinkBaseUrl: options.baseUrl },
    clock,
    queue === undefined ? generateTableId : () => queue.shift() ?? 'exhausted-id-supply',
    options.guests,
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
        ownerAccountId: null,
        plan: 'basic',
        voiceAssistant: false,
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
        ownerAccountId: null,
        plan: 'basic',
        voiceAssistant: false,
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

    it('assigns an order, and removes the owner only for an explicit null', async () => {
      const { registry } = setup({ ids: ['table-a1'] });
      await registry.create(NEW_TABLE);

      expect(
        await registry.update('table-a1', {
          ownerAccountId: 'customer-1',
          plan: 'personalized',
          voiceAssistant: true,
        }),
      ).toMatchObject({ ownerAccountId: 'customer-1', plan: 'personalized', voiceAssistant: true });
      // A patch that does not mention the owner keeps it.
      expect((await registry.update('table-a1', { enabled: false })).ownerAccountId).toBe(
        'customer-1',
      );
      expect((await registry.update('table-a1', { ownerAccountId: null })).ownerAccountId).toBe(
        null,
      );
    });
  });

  describe('who may use a table', () => {
    const owner = {
      id: 'customer-1',
      email: 'a@x.test',
      displayName: 'A',
      role: 'customer',
    } as const;
    const other = { ...owner, id: 'customer-2' };
    const admin = { ...owner, id: 'admin-1', role: 'admin' } as const;

    async function owned() {
      const context = setup({ ids: ['table-a1'] });
      await context.registry.create({ ...NEW_TABLE, ownerAccountId: owner.id });
      return context.registry;
    }

    it('lets the owner read and command it', async () => {
      const registry = await owned();

      expect((await registry.getFor('table-a1', owner)).id).toBe('table-a1');
      expect((await registry.getFor('table-a1', owner, 'command')).id).toBe('table-a1');
    });

    it('lets an admin read it, but not command it', async () => {
      const registry = await owned();

      expect((await registry.getFor('table-a1', admin)).id).toBe('table-a1');
      expect(
        ((await failureOf(registry.getFor('table-a1', admin, 'command'))) as DomainException).code,
      ).toBe('TABLE_NOT_FOUND');
    });

    it('tells anyone else the table does not exist, as for an unknown id', async () => {
      const registry = await owned();

      for (const failure of [
        await failureOf(registry.getFor('table-a1', other)),
        await failureOf(registry.getFor('nope-nope', owner)),
      ]) {
        expect((failure as DomainException).code).toBe('TABLE_NOT_FOUND');
      }
    });

    it('gives an unowned table to nobody but admins', async () => {
      const { registry } = setup({ ids: ['table-a1'] });
      await registry.create(NEW_TABLE);

      expect(((await failureOf(registry.getFor('table-a1', owner))) as DomainException).code).toBe(
        'TABLE_NOT_FOUND',
      );
      expect((await registry.getFor('table-a1', admin)).id).toBe('table-a1');
    });

    describe('for a guest', () => {
      const guest = { ...owner, id: 'guest-1' };
      const HOUR = 3_600_000;

      /** `guest-1` is a guest of `table-a1` for an hour from the start. */
      async function shared() {
        const until = Date.parse(START) + HOUR;
        const context = setup({
          ids: ['table-a1', 'table-b2'],
          guests: {
            isGuest: (tableId, accountId, now) =>
              tableId === 'table-a1' && accountId === 'guest-1' && now < until,
          },
        });
        await context.registry.create({ ...NEW_TABLE, ownerAccountId: owner.id });
        await context.registry.create({ ...NEW_TABLE, ownerAccountId: owner.id });

        return context;
      }

      it('lets a guest read and command the table, but not manage it', async () => {
        const { registry } = await shared();

        expect((await registry.getFor('table-a1', guest)).id).toBe('table-a1');
        expect((await registry.getFor('table-a1', guest, 'command')).id).toBe('table-a1');
        expect(
          ((await failureOf(registry.getFor('table-a1', guest, 'manage'))) as DomainException).code,
        ).toBe('TABLE_NOT_FOUND');
      });

      it('lets the owner manage it, and nobody else', async () => {
        const { registry } = await shared();

        expect((await registry.getFor('table-a1', owner, 'manage')).id).toBe('table-a1');
        for (const account of [other, admin]) {
          expect(
            ((await failureOf(registry.getFor('table-a1', account, 'manage'))) as DomainException)
              .code,
          ).toBe('TABLE_NOT_FOUND');
        }
      });

      it('is a guest of that table only', async () => {
        const { registry } = await shared();

        expect(
          ((await failureOf(registry.getFor('table-b2', guest))) as DomainException).code,
        ).toBe('TABLE_NOT_FOUND');
      });

      it('is nobody again once the access has ended', async () => {
        const { registry, clock } = await shared();
        clock.advance(HOUR - 1);

        expect((await registry.getFor('table-a1', guest)).id).toBe('table-a1');

        clock.advance(1);

        expect(
          ((await failureOf(registry.getFor('table-a1', guest))) as DomainException).code,
        ).toBe('TABLE_NOT_FOUND');
      });
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
