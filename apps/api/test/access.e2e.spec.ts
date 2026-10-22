import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import {
  adminTableSchema,
  apiErrorResponseSchema,
  claimTokenResponseSchema,
  createShareResponseSchema,
  drawingJobSchema,
  getTableResponseSchema,
  pairTableResponseSchema,
  parsePairingLink,
  provisionTableResponseSchema,
  sessionResponseSchema,
  type ClaimToken,
  type SessionResponse,
} from '@athar/contracts';
import { TableAccessRepository } from '../src/access/access.repository.js';
import { CLAIM_TOKEN_TTL_MS } from '../src/access/access.service.js';
import { FakeClock } from '../src/device/fake-clock.js';
import { bearer, createTestApp, signIn, TEST_PASSWORD } from './create-test-app.js';

/**
 * Claiming and sharing a table over HTTP: an admin provisions it, its customer
 * claims it with the code on its QR, and the owner shares it with guests.
 */

let app: NestExpressApplication | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

const BASE = 'https://link.example.com';
const HOUR = 3_600_000;

async function setup(environment: Record<string, unknown> = { PUBLIC_LINK_BASE_URL: BASE }) {
  const clock = new FakeClock();
  const created = await createTestApp(environment, { clock });
  app = created;
  const http = () => request(created.getHttpServer());
  const admin = await signIn(created, 'admin');

  /** Customers a table was provisioned for, not yet handed out by `customer()`. */
  const reserved: SessionResponse[] = [];

  /**
   * The customer that scans next: the one the last table provisioned here was made
   * for (a code is for one customer only), or a new customer when none is waiting.
   */
  const customer = async () => reserved.shift() ?? signIn(created, 'customer');

  /** A table for `forCustomer`, or for a new customer that `customer()` will return. */
  const provision = async (forCustomer?: SessionResponse) => {
    const target = forCustomer ?? (await signIn(created, 'customer'));
    const provisioned = provisionTableResponseSchema.parse(
      (
        await http()
          .post('/api/v1/admin/tables/provision')
          .set(bearer(admin))
          .send({
            displayName: 'Hall',
            location: 'Ground floor',
            customerAccountId: target.account.id,
          })
          .expect(201)
      ).body,
    );

    if (forCustomer === undefined) {
      reserved.push(target);
    }

    return provisioned;
  };

  const pair = (session: SessionResponse, tableId: string, token: string) =>
    http().post('/api/v1/tables/pair').set(bearer(session)).send({ tableId, token });

  const tokenOf = (pairing: Pick<ClaimToken, 'link'>) => {
    const parsed = parsePairingLink(pairing.link);
    expect(parsed).not.toBeNull();

    return (parsed as { tableId: string; token: string }).token;
  };

  /** A provisioned table claimed by a new customer. */
  const claimed = async () => {
    const provisioned = await provision();
    const owner = await customer();
    await pair(owner, provisioned.table.id, provisioned.pairing.token).expect(200);

    return { tableId: provisioned.table.id, owner };
  };

  const share = (session: SessionResponse, tableId: string, body: object = {}) =>
    http().post(`/api/v1/tables/${tableId}/shares`).set(bearer(session)).send(body);

  const codeOf = async (pending: request.Test, status: number) =>
    apiErrorResponseSchema.parse((await pending.expect(status)).body).error.code;

  const read = (session: SessionResponse, tableId: string) =>
    http().get(`/api/v1/tables/${tableId}`).set(bearer(session));

  /** Sign in again as the same account: a session does not outlive a long jump of the fake clock. */
  const relogin = async (session: SessionResponse) =>
    sessionResponseSchema.parse(
      (
        await http()
          .post('/api/v1/auth/login')
          .send({ email: session.account.email, password: TEST_PASSWORD })
          .expect(200)
      ).body,
    );

  return {
    clock,
    http,
    admin,
    customer,
    provision,
    pair,
    tokenOf,
    claimed,
    share,
    codeOf,
    read,
    relogin,
  };
}

type Api = Awaited<ReturnType<typeof setup>>;

describe('provisioning a table (admin)', () => {
  it('needs an admin session', async () => {
    const api = await setup();
    const customer = await api.customer();

    await api.http().post('/api/v1/admin/tables/provision').send({}).expect(401);
    await api
      .http()
      .post('/api/v1/admin/tables/provision')
      .set(bearer(customer))
      .send({ displayName: 'Hall', location: 'Floor' })
      .expect(403);
  });

  it('creates a table nobody owns, a broker login for it and a claim link', async () => {
    const api = await setup();

    const { table, mqtt, pairing } = await api.provision();

    expect(table).toMatchObject({ ownerAccountId: null, enabled: true, plan: 'basic' });
    expect(mqtt).toMatchObject({
      host: 'localhost',
      port: 1883,
      tls: false,
      username: table.id,
      clientId: table.id,
    });
    expect(mqtt.password.length).toBeGreaterThanOrEqual(32);
    expect(pairing.link).toBe(`${BASE}/pair?tableId=${table.id}&token=${pairing.token}`);
    expect(pairing.deepLink).toBe(`athar://pair?tableId=${table.id}&token=${pairing.token}`);
    expect(Date.parse(pairing.expiresAt) - api.clock.now()).toBe(CLAIM_TOKEN_TTL_MS);
  });

  it('holds no broker password in the link the QR code carries', async () => {
    const api = await setup();

    const { mqtt, pairing } = await api.provision();

    expect(JSON.stringify(pairing)).not.toContain(mqtt.password);
  });

  it('uses the app link in development, when no public origin is configured', async () => {
    const api = await setup({});

    const { pairing } = await api.provision();

    expect(pairing.link).toBe(pairing.deepLink);
  });

  it('gives each table its own id, login and code', async () => {
    const api = await setup();

    const first = await api.provision();
    const second = await api.provision();

    expect(first.table.id).not.toBe(second.table.id);
    expect(first.mqtt.password).not.toBe(second.mqtt.password);
    expect(first.pairing.token).not.toBe(second.pairing.token);
  });

  it('refuses a request without a name', async () => {
    const api = await setup();

    expect(
      await api.codeOf(
        api
          .http()
          .post('/api/v1/admin/tables/provision')
          .set(bearer(api.admin))
          .send({ location: 'Floor' }),
        400,
      ),
    ).toBe('VALIDATION_FAILED');
  });

  describe('a code is for one table and one customer', () => {
    it('names the customer it is for', async () => {
      const api = await setup();
      const { table, pairing } = await api.provision();
      const owner = await api.customer();

      expect(pairing.accountId).toBe(owner.account.id);
      expect(table.reservedForAccountId).toBe(owner.account.id);
    });

    it('turns another customer away, says why, and stays valid for the right one', async () => {
      const api = await setup();
      const { table, pairing } = await api.provision();
      const owner = await api.customer();
      const intruder = await api.customer();

      expect(await api.codeOf(api.pair(intruder, table.id, pairing.token), 403)).toBe(
        'PAIRING_WRONG_ACCOUNT',
      );
      // The wrong customer learned nothing and gained nothing, and the code is not spent.
      await api.read(intruder, table.id).expect(404);
      expect(
        pairTableResponseSchema.parse(
          (await api.pair(owner, table.id, pairing.token).expect(200)).body,
        ),
      ).toStrictEqual({ tableId: table.id, role: 'owner', expiresAt: null });
    });

    it('is not for an admin either', async () => {
      const api = await setup();
      const { table, pairing } = await api.provision();

      await api.pair(api.admin, table.id, pairing.token).expect(403);
    });

    it('needs a customer that exists and is active when the table is provisioned', async () => {
      const api = await setup();
      const send = (body: object) =>
        api
          .http()
          .post('/api/v1/admin/tables/provision')
          .set(bearer(api.admin))
          .send({ displayName: 'Hall', location: 'Floor', ...body });

      expect(await api.codeOf(send({}), 400)).toBe('VALIDATION_FAILED');
      expect(await api.codeOf(send({ customerAccountId: 'no-such-account' }), 400)).toBe(
        'VALIDATION_FAILED',
      );
      expect(await api.codeOf(send({ customerAccountId: api.admin.account.id }), 400)).toBe(
        'VALIDATION_FAILED',
      );
    });

    it('moves to another customer when the admin asks for a code for them', async () => {
      const api = await setup();
      const { table, pairing } = await api.provision();
      const first = await api.customer();
      const second = await api.customer();

      const fresh = claimTokenResponseSchema.parse(
        (
          await api
            .http()
            .post(`/api/v1/admin/tables/${table.id}/claim-token`)
            .set(bearer(api.admin))
            .send({ customerAccountId: second.account.id })
            .expect(201)
        ).body,
      );

      expect(fresh.pairing.accountId).toBe(second.account.id);
      // The first code is replaced, and the new one is no use to the first customer.
      expect(await api.codeOf(api.pair(first, table.id, pairing.token), 400)).toBe(
        'PAIRING_TOKEN_INVALID',
      );
      expect(await api.codeOf(api.pair(first, table.id, fresh.pairing.token), 403)).toBe(
        'PAIRING_WRONG_ACCOUNT',
      );
      await api.pair(second, table.id, fresh.pairing.token).expect(200);
    });
  });

  describe('a new claim code', () => {
    const regenerate = (api: Api, tableId: string, admin: SessionResponse = api.admin) =>
      api.http().post(`/api/v1/admin/tables/${tableId}/claim-token`).set(bearer(admin));

    it('replaces the earlier one, which stops working', async () => {
      const api = await setup();
      const { table, pairing } = await api.provision();

      const fresh = claimTokenResponseSchema.parse(
        (await regenerate(api, table.id).expect(201)).body,
      );
      const customer = await api.customer();

      expect(fresh.tableId).toBe(table.id);
      expect(fresh.pairing.token).not.toBe(pairing.token);
      expect(await api.codeOf(api.pair(customer, table.id, pairing.token), 400)).toBe(
        'PAIRING_TOKEN_INVALID',
      );
      await api.pair(customer, table.id, fresh.pairing.token).expect(200);
    });

    it('works for a code that expired in stock', async () => {
      const api = await setup();
      const { table, pairing } = await api.provision();
      api.clock.advance(CLAIM_TOKEN_TTL_MS + 1);
      // The customer was made with the table, so its session ended with the weeks that passed.
      const customer = await api.relogin(await api.customer());
      const admin = await api.relogin(api.admin);

      expect(await api.codeOf(api.pair(customer, table.id, pairing.token), 400)).toBe(
        'PAIRING_TOKEN_INVALID',
      );

      const fresh = claimTokenResponseSchema.parse(
        (await regenerate(api, table.id, admin).expect(201)).body,
      );
      await api.pair(customer, table.id, fresh.pairing.token).expect(200);
    });

    it('is refused for an unknown table, and for one that already has an owner', async () => {
      const api = await setup();
      const { tableId } = await api.claimed();

      expect(await api.codeOf(regenerate(api, 'no-such-table'), 404)).toBe('TABLE_NOT_FOUND');
      expect(await api.codeOf(regenerate(api, tableId), 409)).toBe('TABLE_ALREADY_CLAIMED');
    });

    it('needs an admin session', async () => {
      const api = await setup();
      const { table } = await api.provision();
      const customer = await api.customer();

      await api.http().post(`/api/v1/admin/tables/${table.id}/claim-token`).expect(401);
      await api
        .http()
        .post(`/api/v1/admin/tables/${table.id}/claim-token`)
        .set(bearer(customer))
        .expect(403);
    });
  });
});

describe('claiming a table (customer)', () => {
  it('makes the customer its owner, and only them', async () => {
    const api = await setup();
    const { table, pairing } = await api.provision();
    const owner = await api.customer();
    const stranger = await api.customer();

    const result = pairTableResponseSchema.parse(
      (await api.pair(owner, table.id, pairing.token).expect(200)).body,
    );

    expect(result).toStrictEqual({ tableId: table.id, role: 'owner', expiresAt: null });
    expect(
      getTableResponseSchema.parse((await api.read(owner, table.id).expect(200)).body).id,
    ).toBe(table.id);
    await api.read(stranger, table.id).expect(404);
  });

  it('works once: the same code, used again by someone else, is invalid', async () => {
    const api = await setup();
    const { table, pairing } = await api.provision();
    const owner = await api.customer();
    const other = await api.customer();
    await api.pair(owner, table.id, pairing.token).expect(200);

    expect(await api.codeOf(api.pair(other, table.id, pairing.token), 400)).toBe(
      'PAIRING_TOKEN_INVALID',
    );
  });

  it('tells the owner who scans their own table again that all is well', async () => {
    const api = await setup();
    const { tableId, owner } = await api.claimed();

    const again = await api.pair(owner, tableId, 'x'.repeat(43)).expect(200);

    expect(again.body).toStrictEqual({ tableId, role: 'owner', expiresAt: null });
  });

  it('answers a code that is wrong, for another table, or for no table in the same words', async () => {
    const api = await setup();
    const first = await api.provision();
    const second = await api.provision();
    const customer = await api.customer();
    const answers = await Promise.all([
      api.pair(customer, first.table.id, 'A'.repeat(43)),
      api.pair(customer, first.table.id, second.pairing.token),
      api.pair(customer, 'no-such-table', first.pairing.token),
    ]);

    for (const answer of answers) {
      expect(answer.status).toBe(400);
    }

    const errors = answers.map((answer) => apiErrorResponseSchema.parse(answer.body).error);

    expect(new Set(errors.map((error) => error.code))).toStrictEqual(
      new Set(['PAIRING_TOKEN_INVALID']),
    );
    expect(new Set(errors.map((error) => error.message)).size).toBe(1);
  });

  it('refuses a code once the table has an owner, without spending it', async () => {
    const api = await setup();
    const { table, pairing } = await api.provision();
    const assigned = await api.customer();
    const scanner = await api.customer();

    await api
      .http()
      .patch(`/api/v1/admin/tables/${table.id}`)
      .set(bearer(api.admin))
      .send({ ownerAccountId: assigned.account.id })
      .expect(200);

    expect(await api.codeOf(api.pair(scanner, table.id, pairing.token), 409)).toBe(
      'TABLE_ALREADY_CLAIMED',
    );
  });

  it('is for customers with a session, and for well-formed requests', async () => {
    const api = await setup();
    const { table, pairing } = await api.provision();
    const customer = await api.customer();

    await api
      .http()
      .post('/api/v1/tables/pair')
      .send({ tableId: table.id, token: pairing.token })
      .expect(401);
    await api.pair(api.admin, table.id, pairing.token).expect(403);
    expect(await api.codeOf(api.pair(customer, 'X', pairing.token), 400)).toBe('VALIDATION_FAILED');
    expect(await api.codeOf(api.pair(customer, table.id, 'short'), 400)).toBe('VALIDATION_FAILED');
  });

  it('is won by exactly one of several customers claiming at the same moment', async () => {
    const api = await setup();
    const { table, pairing } = await api.provision();
    const customers = await Promise.all(Array.from({ length: 6 }, () => api.customer()));

    const answers = await Promise.all(
      customers.map((customer) => api.pair(customer, table.id, pairing.token)),
    );

    expect(answers.filter((answer) => answer.status === 200)).toHaveLength(1);
    expect(answers.filter((answer) => answer.status === 400)).toHaveLength(5);
  });

  it('keeps no token in the stored records, only its hash', async () => {
    const api = await setup();
    const { pairing } = await api.provision();
    const stored = JSON.stringify(
      (app as NestExpressApplication).get(TableAccessRepository).list(),
    );

    expect(stored).not.toContain(pairing.token);
    expect(stored).toContain('"kind":"claim"');
  });
});

describe('sharing a table with guests', () => {
  it('lets the owner, and only the owner, create a link', async () => {
    const api = await setup();
    const { tableId, owner } = await api.claimed();
    const stranger = await api.customer();

    const created = createShareResponseSchema.parse(
      (await api.share(owner, tableId).expect(201)).body,
    );
    const token = api.tokenOf(created);

    expect(created.maxUses).toBe(1);
    expect(created.link).toBe(`${BASE}/pair?tableId=${tableId}&token=${token}`);
    expect(Date.parse(created.expiresAt) - api.clock.now()).toBe(24 * HOUR);
    expect(await api.codeOf(api.share(stranger, tableId), 404)).toBe('TABLE_NOT_FOUND');
    expect(await api.codeOf(api.share(api.admin, tableId), 403)).toBe('FORBIDDEN');
    await api.http().post(`/api/v1/tables/${tableId}/shares`).send({}).expect(401);
  });

  it('honours the duration and the number of uses, and bounds them', async () => {
    const api = await setup();
    const { tableId, owner } = await api.claimed();

    const created = createShareResponseSchema.parse(
      (await api.share(owner, tableId, { expiresInHours: 2, maxUses: 3 }).expect(201)).body,
    );

    expect(created.maxUses).toBe(3);
    expect(Date.parse(created.expiresAt) - api.clock.now()).toBe(2 * HOUR);

    for (const body of [
      { expiresInHours: 0 },
      { expiresInHours: 169 },
      { maxUses: 0 },
      { maxUses: 11 },
    ]) {
      expect(await api.codeOf(api.share(owner, tableId, body), 400)).toBe('VALIDATION_FAILED');
    }
  });

  it('refuses a table that does not exist, like a stranger would be refused', async () => {
    const api = await setup();
    const owner = await api.customer();

    expect(await api.codeOf(api.share(owner, 'no-such-table'), 404)).toBe('TABLE_NOT_FOUND');
  });

  describe('a guest', () => {
    async function shared(body: object = {}) {
      const api = await setup();
      const { tableId, owner } = await api.claimed();
      const created = createShareResponseSchema.parse(
        (await api.share(owner, tableId, body).expect(201)).body,
      );

      return { ...api, tableId, owner, created, token: api.tokenOf(created) };
    }

    it('joins with the link, sees the table, and is told when it ends', async () => {
      const api = await shared();
      const guest = await api.customer();

      const result = pairTableResponseSchema.parse(
        (await api.pair(guest, api.tableId, api.token).expect(200)).body,
      );

      expect(result).toStrictEqual({
        tableId: api.tableId,
        role: 'guest',
        expiresAt: api.created.expiresAt,
      });
      const seen = await api.read(guest, api.tableId).expect(200);

      expect(seen.body).toMatchObject({ access: { role: 'guest' } });
    });

    it('can follow the same link again without using it up', async () => {
      const api = await shared({ maxUses: 1 });
      const guest = await api.customer();
      const other = await api.customer();

      await api.pair(guest, api.tableId, api.token).expect(200);
      await api.pair(guest, api.tableId, api.token).expect(200);

      expect(await api.codeOf(api.pair(other, api.tableId, api.token), 400)).toBe(
        'PAIRING_TOKEN_INVALID',
      );
    });

    it('is limited by the number of uses', async () => {
      const api = await shared({ maxUses: 2 });
      const [first, second, third] = await Promise.all([
        api.customer(),
        api.customer(),
        api.customer(),
      ]);

      await api.pair(first, api.tableId, api.token).expect(200);
      await api.pair(second, api.tableId, api.token).expect(200);

      expect(await api.codeOf(api.pair(third, api.tableId, api.token), 400)).toBe(
        'PAIRING_TOKEN_INVALID',
      );
      await api.read(third, api.tableId).expect(404);
    });

    it('loses access when the link expires', async () => {
      const api = await shared({ expiresInHours: 2 });
      const guest = await api.customer();
      await api.pair(guest, api.tableId, api.token).expect(200);
      api.clock.advance(2 * HOUR - 1);
      const later = await api.relogin(guest);
      await api.read(later, api.tableId).expect(200);

      api.clock.advance(1);

      await api.read(later, api.tableId).expect(404);
    });

    it('cannot use an expired link', async () => {
      const api = await shared({ expiresInHours: 1 });
      api.clock.advance(HOUR);
      const late = await api.customer();

      expect(await api.codeOf(api.pair(late, api.tableId, api.token), 400)).toBe(
        'PAIRING_TOKEN_INVALID',
      );
    });

    it('cannot use the link on another table', async () => {
      const api = await shared();
      const guest = await api.customer();
      const { tableId: otherTable } = await api.claimed();

      expect(await api.codeOf(api.pair(guest, otherTable, api.token), 400)).toBe(
        'PAIRING_TOKEN_INVALID',
      );
    });

    it('can command the table: pair the session, start a drawing, stop it', async () => {
      const api = await shared();
      const guest = await api.customer();
      await api.pair(guest, api.tableId, api.token).expect(200);
      await api.http().post(`/api/v1/tables/${api.tableId}/pairing`).set(bearer(guest)).expect(200);

      const job = drawingJobSchema.parse(
        (
          await api
            .http()
            .post(`/api/v1/tables/${api.tableId}/jobs`)
            .set(bearer(guest))
            .send({ kind: 'rake', clientRequestId: randomUUID() })
            .expect(201)
        ).body,
      );

      // The owner sees the guest's drawing, and the guest can stop it.
      await api.http().get(`/api/v1/jobs/${job.id}`).set(bearer(api.owner)).expect(200);
      await api.http().post(`/api/v1/jobs/${job.id}/stop`).set(bearer(guest)).expect(200);
    });

    it('cannot share the table, and a stranger still cannot see it', async () => {
      const api = await shared();
      const guest = await api.customer();
      const stranger = await api.customer();
      await api.pair(guest, api.tableId, api.token).expect(200);

      expect(await api.codeOf(api.share(guest, api.tableId), 404)).toBe('TABLE_NOT_FOUND');
      await api.read(stranger, api.tableId).expect(404);
    });

    it('does not become the owner', async () => {
      const api = await shared();
      const guest = await api.customer();
      await api.pair(guest, api.tableId, api.token).expect(200);

      const record = adminTableSchema.parse(
        (
          await api
            .http()
            .get(`/api/v1/admin/tables/${api.tableId}`)
            .set(bearer(api.admin))
            .expect(200)
        ).body,
      );

      expect(record.ownerAccountId).toBe(api.owner.account.id);
    });
  });
});
