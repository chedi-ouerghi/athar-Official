import { randomUUID } from 'node:crypto';
import {
  adminTableSchema,
  apiErrorResponseSchema,
  customerAccessResponseSchema,
  drawingJobSchema,
  getTableResponseSchema,
  listCustomersResponseSchema,
  sessionResponseSchema,
  type SessionResponse,
} from '@athar/contracts';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { TEST_PASSWORD, bearer, createTimedApp, signIn, type TimedApp } from './create-test-app.js';

/**
 * Orders and entitlements over HTTP (Phase 3): an admin creates a customer, the
 * customer activates, the admin assigns them a table with a plan, and from then
 * on only that customer (and admins, to read) can see the table and its jobs.
 */

let current: TimedApp | undefined;

afterEach(async () => {
  await current?.app.close();
  current = undefined;
});

const errorOf = (body: unknown) => apiErrorResponseSchema.parse(body).error;

async function setup() {
  current = await createTimedApp();
  const app = current.app;
  const http = () => request(app.getHttpServer());
  const admin = bearer(await signIn(app));

  /** Created by the admin over HTTP, activated by the customer over HTTP. */
  const customer = async (email = `${randomUUID()}@athar.test`) => {
    const created = customerAccessResponseSchema.parse(
      (
        await http()
          .post('/api/v1/admin/customers')
          .set(admin)
          .send({ email, displayName: 'Reem' })
          .expect(201)
      ).body,
    );
    const session = sessionResponseSchema.parse(
      (
        await http()
          .post('/api/v1/auth/activate')
          .send({ email, activationCode: created.activationCode, password: TEST_PASSWORD })
          .expect(200)
      ).body,
    );

    return { created, session, email };
  };

  const createTable = async (body: Record<string, unknown> = {}) =>
    adminTableSchema.parse(
      (
        await http()
          .post('/api/v1/admin/tables')
          .set(admin)
          .send({ displayName: 'Main hall', location: 'Ground floor', ...body })
          .expect(201)
      ).body,
    ).id;

  return { http, admin, customer, createTable };
}

describe('orders and entitlements', () => {
  it('a customer sees exactly the table they ordered, with its features; nobody else does', async () => {
    const { http, admin, customer, createTable } = await setup();

    // The admin creates the customer, who activates with the one-time code.
    const reem = await customer();
    expect(reem.created.account).toMatchObject({ role: 'customer', status: 'pending-activation' });
    expect(reem.created.activationCode).toMatch(/^[A-Z0-9]{10}$/);

    // The admin registers table T, then assigns it: personalized, with the voice assistant.
    const tableId = await createTable();
    await http()
      .patch(`/api/v1/admin/tables/${tableId}`)
      .set(admin)
      .send({
        ownerAccountId: reem.created.account.id,
        plan: 'personalized',
        voiceAssistant: true,
      })
      .expect(200);

    // The customer scans T and sees what they ordered.
    const table = getTableResponseSchema.parse(
      (await http().get(`/api/v1/tables/${tableId}`).set(bearer(reem.session)).expect(200)).body,
    );
    expect(table).toMatchObject({ id: tableId, plan: 'personalized', voiceAssistant: true });
    expect(table.features).toEqual(
      expect.arrayContaining(['drawingPen', 'ledAmbiences', 'voiceAssistant']),
    );

    // Another customer is told T does not exist, for the table, its jobs and a new job.
    const other = bearer((await customer()).session);
    const notFound = async (pending: request.Test, code: string) =>
      expect(errorOf((await pending.expect(404)).body).code).toBe(code);

    await notFound(http().get(`/api/v1/tables/${tableId}`).set(other), 'TABLE_NOT_FOUND');
    await notFound(http().get(`/api/v1/tables/${tableId}/jobs`).set(other), 'TABLE_NOT_FOUND');
    await notFound(http().post(`/api/v1/tables/${tableId}/pairing`).set(other), 'TABLE_NOT_FOUND');
    await notFound(
      http()
        .post(`/api/v1/tables/${tableId}/jobs`)
        .set(other)
        .send({ designId: 'star', clientRequestId: randomUUID() }),
      'TABLE_NOT_FOUND',
    );

    // The owner pairs and starts a job; the other customer cannot see or command it.
    await http().post(`/api/v1/tables/${tableId}/pairing`).set(bearer(reem.session)).expect(200);
    const job = drawingJobSchema.parse(
      (
        await http()
          .post(`/api/v1/tables/${tableId}/jobs`)
          .set(bearer(reem.session))
          .send({ designId: 'star', clientRequestId: randomUUID() })
          .expect(201)
      ).body,
    );
    await notFound(http().get(`/api/v1/jobs/${job.id}`).set(other), 'JOB_NOT_FOUND');
    for (const command of ['pause', 'resume', 'stop']) {
      await notFound(http().post(`/api/v1/jobs/${job.id}/${command}`).set(other), 'JOB_NOT_FOUND');
    }

    // An admin may read any table and any job, but does not command them.
    await http().get(`/api/v1/tables/${tableId}`).set(admin).expect(200);
    await http().get(`/api/v1/tables/${tableId}/jobs`).set(admin).expect(200);
    await http().get(`/api/v1/jobs/${job.id}`).set(admin).expect(200);
    await notFound(http().post(`/api/v1/jobs/${job.id}/stop`).set(admin), 'JOB_NOT_FOUND');
    await notFound(http().post(`/api/v1/tables/${tableId}/pairing`).set(admin), 'TABLE_NOT_FOUND');

    // The owner still can.
    await http().post(`/api/v1/jobs/${job.id}/stop`).set(bearer(reem.session)).expect(200);
  });

  it('every table, design and job route needs a session; health and ready do not', async () => {
    const { http } = await setup();

    for (const path of [
      '/api/v1/tables/table-001',
      '/api/v1/tables/table-001/jobs',
      `/api/v1/jobs/${randomUUID()}`,
      '/api/v1/designs',
      '/api/v1/designs/star',
    ]) {
      expect(errorOf((await http().get(path).expect(401)).body).code).toBe('UNAUTHORIZED');
    }
    await http().post('/api/v1/tables/table-001/jobs').send({}).expect(401);
    await http().post('/api/v1/tables/table-001/pairing').expect(401);
    await http().delete('/api/v1/tables/table-001/pairing').expect(401);
    await http().post(`/api/v1/jobs/${randomUUID()}/stop`).expect(401);
    await http().get('/health').expect(200);
    await http().get('/ready').expect(200);
  });
});

describe('admin customer endpoints', () => {
  it('lists customers with their status, never a hash or a code', async () => {
    const { http, admin, customer } = await setup();
    const active = await customer();
    const pending = customerAccessResponseSchema.parse(
      (
        await http()
          .post('/api/v1/admin/customers')
          .set(admin)
          .send({ email: 'Pending@Athar.TEST', displayName: 'Pending' })
          .expect(201)
      ).body,
    );
    expect(pending.account.email).toBe('pending@athar.test');

    const response = await http().get('/api/v1/admin/customers').set(admin).expect(200);
    const { customers } = listCustomersResponseSchema.parse(response.body);

    expect(customers.map((account) => [account.id, account.status])).toStrictEqual([
      [active.created.account.id, 'active'],
      [pending.account.id, 'pending-activation'],
    ]);
    const raw = JSON.stringify(response.body);
    expect(raw).not.toContain(pending.activationCode);
    expect(raw).not.toMatch(/hash|activationCode|password/i);
  });

  it('refuses a duplicate email with ACCOUNT_EXISTS, whatever its case', async () => {
    const { http, admin, customer } = await setup();
    await customer('taken@athar.test');

    const response = await http()
      .post('/api/v1/admin/customers')
      .set(admin)
      .send({ email: 'TAKEN@athar.test', displayName: 'Again' })
      .expect(409);

    expect(errorOf(response.body).code).toBe('ACCOUNT_EXISTS');
  });

  it('reset-access ends every session, the old password, and issues a working new code', async () => {
    const { http, admin, customer } = await setup();
    const reem = await customer();
    const id = reem.created.account.id;

    const reset = customerAccessResponseSchema.parse(
      (await http().post(`/api/v1/admin/customers/${id}/reset-access`).set(admin).expect(200)).body,
    );
    expect(reset.account.status).toBe('pending-activation');
    expect(reset.activationCode).not.toBe(reem.created.activationCode);

    // The old session is over, and so is the old password.
    const old = await http().get('/api/v1/auth/me').set(bearer(reem.session)).expect(401);
    expect(errorOf(old.body).code).toBe('SESSION_EXPIRED');
    await http()
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: reem.session.refreshToken })
      .expect(401);
    await http()
      .post('/api/v1/auth/login')
      .send({ email: reem.email, password: TEST_PASSWORD })
      .expect(401);

    // The new code works once.
    const activate = () =>
      http()
        .post('/api/v1/auth/activate')
        .send({ email: reem.email, activationCode: reset.activationCode, password: TEST_PASSWORD });
    const fresh: SessionResponse = sessionResponseSchema.parse((await activate().expect(200)).body);
    await http().get('/api/v1/auth/me').set(bearer(fresh)).expect(200);
    await activate().expect(400);
  });

  it('disable ends every session: the customer gets SESSION_EXPIRED and cannot sign in', async () => {
    const { http, admin, customer } = await setup();
    const reem = await customer();

    const disabled = await http()
      .post(`/api/v1/admin/customers/${reem.created.account.id}/disable`)
      .set(admin)
      .expect(200);
    expect(disabled.body).toMatchObject({ status: 'disabled' });

    const response = await http().get('/api/v1/auth/me').set(bearer(reem.session)).expect(401);
    expect(errorOf(response.body).code).toBe('SESSION_EXPIRED');
    await http()
      .post('/api/v1/auth/login')
      .send({ email: reem.email, password: TEST_PASSWORD })
      .expect(401);
  });

  it('answers NOT_FOUND for an unknown account and for an admin', async () => {
    const { http, admin } = await setup();
    const adminId = (await signIn(current!.app)).account.id;

    for (const id of ['no-such-account', adminId]) {
      for (const action of ['reset-access', 'disable']) {
        const response = await http()
          .post(`/api/v1/admin/customers/${id}/${action}`)
          .set(admin)
          .expect(404);
        expect(errorOf(response.body).code).toBe('NOT_FOUND');
      }
    }
  });

  it('is for admins only: 401 without a session, 403 for a customer', async () => {
    const { http, customer } = await setup();
    const reem = bearer((await customer()).session);
    const routes = [
      () => http().post('/api/v1/admin/customers').send({ email: 'a@b.test', displayName: 'A' }),
      () => http().get('/api/v1/admin/customers'),
      () => http().post('/api/v1/admin/customers/x/reset-access'),
      () => http().post('/api/v1/admin/customers/x/disable'),
    ];

    for (const route of routes) {
      expect(errorOf((await route().expect(401)).body).code).toBe('UNAUTHORIZED');
      expect(errorOf((await route().set(reem).expect(403)).body).code).toBe('FORBIDDEN');
    }
  });

  it('validates the new customer', async () => {
    const { http, admin } = await setup();

    const response = await http()
      .post('/api/v1/admin/customers')
      .set(admin)
      .send({ email: 'not-an-email', displayName: '' })
      .expect(400);

    expect(
      errorOf(response.body)
        .details?.map((detail) => detail.path)
        .sort(),
    ).toStrictEqual(['body.displayName', 'body.email']);
  });
});
