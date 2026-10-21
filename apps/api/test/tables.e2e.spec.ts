import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  adminTableSchema,
  apiErrorResponseSchema,
  getTableResponseSchema,
  listAdminTablesResponseSchema,
  tableIdSchema,
  tableQrResponseSchema,
} from '@athar/contracts';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemoryTableRepository } from '../src/tables/in-memory-table.repository.js';
import { bearer, createTestApp, signIn, signInOwner } from './create-test-app.js';
import { fixtureTables } from './table-fixtures.js';

const ADMIN = '/api/v1/admin/tables';

/** Parse a response against the shared error envelope and return its `error`. */
function errorOf(body: unknown) {
  return apiErrorResponseSchema.parse(body).error;
}

describe('tables over HTTP', () => {
  let app: NestExpressApplication;
  /** An admin's access token, and the header that carries it. */
  let token: string;
  let admin: { Authorization: string };
  /** The customer who owns both fixture tables. */
  let ownerId: string;
  let owner: { Authorization: string };

  beforeAll(async () => {
    app = await createTestApp({}, { repository: new InMemoryTableRepository(fixtureTables()) });
    token = (await signIn(app)).accessToken;
    admin = { Authorization: `Bearer ${token}` };
    const session = await signInOwner(app, 'table-001', 'table-off');
    ownerId = session.account.id;
    owner = bearer(session);
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  describe('GET /api/v1/tables/:tableId (owner or admin)', () => {
    it('returns the Table shape, with mode and connection from the driver', async () => {
      const response = await http().get('/api/v1/tables/table-001').set(owner).expect(200);

      expect(getTableResponseSchema.parse(response.body)).toStrictEqual({
        id: 'table-001',
        displayName: 'Main hall',
        location: 'Ground floor',
        enabled: true,
        mode: 'simulation',
        connection: 'online',
        activeJobId: null,
        plan: 'basic',
        voiceAssistant: false,
        features: ['catalogue', 'rake'],
        ambienceId: null,
        // Not paired yet, so it cannot start.
        readiness: { paired: false, online: true, free: true, canStart: false },
        access: { role: 'owner' },
      });
    });

    it('needs a session: the QR code identifies the table, it does not authorise', async () => {
      const response = await http().get('/api/v1/tables/table-001').expect(401);

      expect(errorOf(response.body).code).toBe('UNAUTHORIZED');
    });

    it('answers TABLE_NOT_FOUND to another customer, exactly as for an unknown table', async () => {
      const stranger = bearer(await signIn(app, 'customer'));
      const response = await http().get('/api/v1/tables/table-001').set(stranger).expect(404);

      expect(errorOf(response.body).code).toBe('TABLE_NOT_FOUND');
    });

    it('lets an admin read any table', async () => {
      await http().get('/api/v1/tables/table-001').set(admin).expect(200);
    });

    it('returns a disabled table with enabled: false', async () => {
      const response = await http().get('/api/v1/tables/table-off').set(owner).expect(200);

      expect(getTableResponseSchema.parse(response.body)).toMatchObject({
        id: 'table-off',
        enabled: false,
      });
    });

    it('answers TABLE_NOT_FOUND with the standard envelope for an unknown table', async () => {
      const response = await http().get('/api/v1/tables/no-such-table').set(owner).expect(404);

      expect(errorOf(response.body)).toMatchObject({ code: 'TABLE_NOT_FOUND' });
    });

    it.each([
      ['uppercase letters', 'TABLE-001'],
      ['too short', 'ab'],
      ['too long', 'a'.repeat(41)],
      ['an underscore', 'table_001'],
      ['a percent-encoded space', 'table%20001'],
    ])('answers VALIDATION_FAILED for an invalid id: %s', async (_label, id) => {
      const response = await http().get(`/api/v1/tables/${id}`).set(owner).expect(400);
      const error = errorOf(response.body);

      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.details?.[0]?.path).toBe('params.tableId');
    });

    it('exposes no registration timestamps and no owner', async () => {
      const response = await http().get('/api/v1/tables/table-001').set(owner).expect(200);

      expect(response.body).not.toHaveProperty('ownerAccountId');
      expect(response.body).not.toHaveProperty('createdAt');
      expect(response.body).not.toHaveProperty('updatedAt');
    });
  });

  describe('admin authentication', () => {
    const routes: [method: 'get' | 'post' | 'patch', path: string][] = [
      ['post', ADMIN],
      ['get', ADMIN],
      ['get', `${ADMIN}/table-001`],
      ['patch', `${ADMIN}/table-001`],
      ['get', `${ADMIN}/table-001/qr`],
    ];

    it.each(routes)('rejects %s %s without a token', async (method, path) => {
      const response = await http()[method](path).expect(401);

      expect(errorOf(response.body).code).toBe('UNAUTHORIZED');
      expect(response.headers['www-authenticate']).toBe('Bearer');
    });

    it.each([
      ['a wrong token', () => 'Bearer wrong-token'],
      ['the token without a scheme', () => token],
      ['the Basic scheme', () => `Basic ${token}`],
      ['Bearer with no token', () => 'Bearer '],
      ['a token with a character changed', () => `Bearer ${token.slice(0, -1)}X`],
      ['a token with a character added', () => `Bearer ${token}x`],
      ['an empty header', () => ''],
    ])('rejects %s', async (_label, header) => {
      await http().get(ADMIN).set('Authorization', header()).expect(401);
    });

    it.each(routes)('refuses %s %s to a customer with FORBIDDEN', async (method, path) => {
      const customer = await signIn(app, 'customer');
      const response = await http()[method](path).set(bearer(customer)).expect(403);

      expect(errorOf(response.body).code).toBe('FORBIDDEN');
    });

    it('gives the same response for a missing, malformed and wrong token', async () => {
      const responses = await Promise.all([
        http().get(ADMIN),
        http().get(ADMIN).set('Authorization', 'Basic abc'),
        http().get(ADMIN).set('Authorization', 'Bearer wrong-token'),
      ]);
      const errors = responses.map((response) => {
        const { requestId, timestamp, ...rest } = errorOf(response.body);
        expect([requestId, timestamp].every((value) => value.length > 0)).toBe(true);
        return rest;
      });

      expect(errors[1]).toStrictEqual(errors[0]);
      expect(errors[2]).toStrictEqual(errors[0]);
      expect(errors[0]).toStrictEqual({
        code: 'UNAUTHORIZED',
        message: 'Authentication is required.',
      });
      expect(responses.map((response) => response.status)).toStrictEqual([401, 401, 401]);
      expect(
        new Set(responses.map((response) => response.headers['www-authenticate'])),
      ).toStrictEqual(new Set(['Bearer']));
    });

    it('never echoes the token it was sent', async () => {
      const response = await http().get(ADMIN).set('Authorization', 'Bearer super-secret-attempt');

      expect(JSON.stringify(response.body)).not.toContain('super-secret-attempt');
      expect(JSON.stringify(response.headers)).not.toContain('super-secret-attempt');
    });

    it('checks the token before the body, so a stranger learns nothing about valid requests', async () => {
      const response = await http().post(ADMIN).send({ displayName: '' }).expect(401);

      expect(errorOf(response.body).code).toBe('UNAUTHORIZED');
    });

    it('accepts the Bearer scheme in any letter case', async () => {
      await http().get(ADMIN).set('Authorization', `bearer ${token}`).expect(200);
    });

    it('does not accept the token in the URL or the body', async () => {
      await http().get(`${ADMIN}?accessToken=${token}`).expect(401);
      await http().post(ADMIN).send({ accessToken: token }).expect(401);
    });
  });

  describe('POST /api/v1/admin/tables (create)', () => {
    it('registers a table under a server-generated id and returns it with 201', async () => {
      const response = await http()
        .post(ADMIN)
        .set(admin)
        .send({ displayName: '  Lobby table ', location: 'Entrance' })
        .expect(201);
      const table = adminTableSchema.parse(response.body);

      expect(tableIdSchema.safeParse(table.id).success).toBe(true);
      expect(table.id).toMatch(/^[a-z2-7]{16}$/);
      expect(table).toMatchObject({
        displayName: 'Lobby table',
        location: 'Entrance',
        enabled: true,
      });
      expect(table.createdAt).toBe(table.updatedAt);
      expect(Date.parse(table.createdAt)).not.toBeNaN();
    });

    it('makes the new table visible to its owner straight away', async () => {
      const created = await http()
        .post(ADMIN)
        .set(admin)
        .send({ displayName: 'Cafe', location: 'Terrace', ownerAccountId: ownerId })
        .expect(201);

      const response = await http()
        .get(`/api/v1/tables/${(created.body as { id: string }).id}`)
        .set(owner)
        .expect(200);

      expect(getTableResponseSchema.parse(response.body)).toMatchObject({
        displayName: 'Cafe',
        enabled: true,
        mode: 'simulation',
      });
    });

    it('registers a disabled table when asked', async () => {
      const response = await http()
        .post(ADMIN)
        .set(admin)
        .send({ displayName: 'Spare', location: 'Store', enabled: false })
        .expect(201);

      expect((response.body as { enabled: boolean }).enabled).toBe(false);
    });

    it('ignores an id chosen by the caller', async () => {
      const response = await http()
        .post(ADMIN)
        .set(admin)
        .send({ id: 'my-chosen-id', displayName: 'Cafe', location: 'Terrace' })
        .expect(201);

      expect((response.body as { id: string }).id).not.toBe('my-chosen-id');
      await http().get('/api/v1/tables/my-chosen-id').set(admin).expect(404);
    });

    it('gives each table a different id', async () => {
      const ids = await Promise.all(
        Array.from({ length: 5 }, async () => {
          const response = await http()
            .post(ADMIN)
            .set(admin)
            .send({ displayName: 'Same name', location: 'Same place' })
            .expect(201);
          return (response.body as { id: string }).id;
        }),
      );

      expect(new Set(ids).size).toBe(5);
    });

    it.each([
      ['a missing displayName', { location: 'x' }, 'body.displayName'],
      ['a missing location', { displayName: 'x' }, 'body.location'],
      ['a blank displayName', { displayName: '   ', location: 'x' }, 'body.displayName'],
      ['an oversized location', { displayName: 'x', location: 'y'.repeat(201) }, 'body.location'],
      [
        'a non-boolean enabled',
        { displayName: 'x', location: 'y', enabled: 'yes' },
        'body.enabled',
      ],
    ])('answers VALIDATION_FAILED for %s, naming the field', async (_label, body, path) => {
      const response = await http().post(ADMIN).set(admin).send(body).expect(400);
      const error = errorOf(response.body);

      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.details?.map((detail) => detail.path)).toContain(path);
    });

    it('answers BAD_REQUEST for a malformed JSON body', async () => {
      const response = await http()
        .post(ADMIN)
        .set(admin)
        .set('content-type', 'application/json')
        .send('{"displayName": ')
        .expect(400);

      expect(errorOf(response.body).code).toBe('BAD_REQUEST');
    });
  });

  describe('GET /api/v1/admin/tables (list) and GET /:tableId', () => {
    it('lists every table, with the fixtures first', async () => {
      const response = await http().get(ADMIN).set(admin).expect(200);
      const { tables } = listAdminTablesResponseSchema.parse(response.body);

      expect(tables.slice(0, 2).map((table) => table.id)).toStrictEqual(['table-001', 'table-off']);
    });

    it('returns the stored record for one table, including timestamps', async () => {
      const response = await http().get(`${ADMIN}/table-001`).set(admin).expect(200);

      expect(adminTableSchema.parse(response.body)).toStrictEqual({
        ...fixtureTables()[0],
        ownerAccountId: ownerId,
        updatedAt: expect.any(String) as string,
      });
    });

    it('answers TABLE_NOT_FOUND for an unknown table', async () => {
      const response = await http().get(`${ADMIN}/no-such-table`).set(admin).expect(404);

      expect(errorOf(response.body).code).toBe('TABLE_NOT_FOUND');
    });

    it('answers VALIDATION_FAILED for an invalid id', async () => {
      const response = await http().get(`${ADMIN}/NOT_VALID`).set(admin).expect(400);

      expect(errorOf(response.body).code).toBe('VALIDATION_FAILED');
    });
  });

  describe('PATCH /api/v1/admin/tables/:tableId (update)', () => {
    async function register(): Promise<string> {
      const response = await http()
        .post(ADMIN)
        .set(admin)
        .send({ displayName: 'Before', location: 'Here' })
        .expect(201);

      return (response.body as { id: string }).id;
    }

    it('changes only the fields sent', async () => {
      const id = await register();

      const response = await http()
        .patch(`${ADMIN}/${id}`)
        .set(admin)
        .send({ displayName: 'After' })
        .expect(200);

      expect(adminTableSchema.parse(response.body)).toMatchObject({
        id,
        displayName: 'After',
        location: 'Here',
        enabled: true,
      });
    });

    it('moves updatedAt forward and leaves createdAt alone', async () => {
      const id = await register();
      const before = (await http().get(`${ADMIN}/${id}`).set(admin)).body as { createdAt: string };
      await new Promise((resolve) => setTimeout(resolve, 5));

      const after = (await http().patch(`${ADMIN}/${id}`).set(admin).send({ location: 'There' }))
        .body as {
        createdAt: string;
        updatedAt: string;
      };

      expect(after.createdAt).toBe(before.createdAt);
      expect(Date.parse(after.updatedAt)).toBeGreaterThan(Date.parse(before.createdAt));
    });

    it('switches a table off, and the table then shows enabled: false', async () => {
      const id = await register();

      await http().patch(`${ADMIN}/${id}`).set(admin).send({ enabled: false }).expect(200);
      const response = await http().get(`/api/v1/tables/${id}`).set(admin).expect(200);

      expect((response.body as { enabled: boolean }).enabled).toBe(false);
    });

    it('never changes the id, even if one is sent along with a real change', async () => {
      const id = await register();

      const response = await http()
        .patch(`${ADMIN}/${id}`)
        .set(admin)
        .send({ id: 'another-id', displayName: 'After' })
        .expect(200);

      expect((response.body as { id: string }).id).toBe(id);
      await http().get('/api/v1/tables/another-id').set(admin).expect(404);
    });

    it.each([
      ['an empty patch', {}],
      ['a patch of only unknown keys', { id: 'x-y-z', mode: 'hardware' }],
      ['a blank displayName', { displayName: '' }],
      ['a non-boolean enabled', { enabled: 'no' }],
    ])('answers VALIDATION_FAILED for %s', async (_label, body) => {
      const response = await http().patch(`${ADMIN}/table-001`).set(admin).send(body).expect(400);

      expect(errorOf(response.body).code).toBe('VALIDATION_FAILED');
    });

    it('assigns an owner, a plan and the voice assistant, and removes the owner with null', async () => {
      const id = await register();

      const assigned = await http()
        .patch(`${ADMIN}/${id}`)
        .set(admin)
        .send({ ownerAccountId: ownerId, plan: 'personalized', voiceAssistant: true })
        .expect(200);
      expect(adminTableSchema.parse(assigned.body)).toMatchObject({
        ownerAccountId: ownerId,
        plan: 'personalized',
        voiceAssistant: true,
      });
      await http().get(`/api/v1/tables/${id}`).set(owner).expect(200);

      await http().patch(`${ADMIN}/${id}`).set(admin).send({ ownerAccountId: null }).expect(200);
      await http().get(`/api/v1/tables/${id}`).set(owner).expect(404);
    });

    it('refuses an owner that is not an existing, enabled customer with VALIDATION_FAILED', async () => {
      const id = await register();
      const adminId = (await signIn(app)).account.id;
      const disabled = await signIn(app, 'customer');
      await http()
        .post(`/api/v1/admin/customers/${disabled.account.id}/disable`)
        .set(admin)
        .expect(200);

      for (const ownerAccountId of ['no-such-account', adminId, disabled.account.id]) {
        const patched = await http()
          .patch(`${ADMIN}/${id}`)
          .set(admin)
          .send({ ownerAccountId })
          .expect(400);
        expect(errorOf(patched.body).code).toBe('VALIDATION_FAILED');

        const created = await http()
          .post(ADMIN)
          .set(admin)
          .send({ displayName: 'x', location: 'y', ownerAccountId })
          .expect(400);
        expect(errorOf(created.body).code).toBe('VALIDATION_FAILED');
      }
    });

    it('answers TABLE_NOT_FOUND for an unknown table', async () => {
      const response = await http()
        .patch(`${ADMIN}/no-such-table`)
        .set(admin)
        .send({ enabled: false })
        .expect(404);

      expect(errorOf(response.body).code).toBe('TABLE_NOT_FOUND');
    });
  });

  describe('GET /api/v1/admin/tables/:tableId/qr', () => {
    it('returns the development link, athar://t/<id>, when no origin is configured', async () => {
      const response = await http().get(`${ADMIN}/table-001/qr`).set(admin).expect(200);

      expect(tableQrResponseSchema.parse(response.body)).toStrictEqual({
        tableId: 'table-001',
        link: 'athar://t/table-001',
      });
    });

    it('answers TABLE_NOT_FOUND for an unknown table', async () => {
      const response = await http().get(`${ADMIN}/no-such-table/qr`).set(admin).expect(404);

      expect(errorOf(response.body).code).toBe('TABLE_NOT_FOUND');
    });

    it('answers VALIDATION_FAILED for an invalid id', async () => {
      await http().get(`${ADMIN}/Bad_Id/qr`).set(admin).expect(400);
    });
  });
});

describe('the QR link with an origin configured', () => {
  let app: NestExpressApplication;
  let admin: { Authorization: string };

  beforeAll(async () => {
    app = await createTestApp({ PUBLIC_LINK_BASE_URL: 'https://app.athar.example/' });
    admin = bearer(await signIn(app));
  });

  afterAll(async () => {
    await app.close();
  });

  it('is <origin>/t/<tableId>, with the trailing slash of the setting normalised away', async () => {
    const response = await request(app.getHttpServer())
      .get(`${ADMIN}/table-001/qr`)
      .set(admin)
      .expect(200);

    expect(tableQrResponseSchema.parse(response.body)).toStrictEqual({
      tableId: 'table-001',
      link: 'https://app.athar.example/t/table-001',
    });
  });

  it('holds only the public id: no query, fragment, token or signature', async () => {
    const response = await request(app.getHttpServer()).get(`${ADMIN}/table-001/qr`).set(admin);
    const { link } = response.body as { link: string };

    expect(link).not.toMatch(/[?#]/);
    expect(Object.keys(response.body as object).sort()).toStrictEqual(['link', 'tableId']);
  });
});
