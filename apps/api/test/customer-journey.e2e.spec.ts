import { randomUUID } from 'node:crypto';
import {
  adminTableSchema,
  customerAccessResponseSchema,
  drawingJobSchema,
  getTableResponseSchema,
  listAmbiencesResponseSchema,
  pairTableResponseSchema,
  parsePairingLink,
  provisionTableResponseSchema,
  sessionResponseSchema,
  tableQrResponseSchema,
  type SessionResponse,
} from '@athar/contracts';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { bearer, createTimedApp, signIn, TEST_PASSWORD, type TimedApp } from './create-test-app.js';

/**
 * Admin, customer and table, end to end over HTTP and through the real services:
 * the admin creates a customer, the customer activates with the code, the admin
 * provisions a table with a size and a plan, the customer claims it with the code
 * on its QR, pairs, draws on the simulated table, and shares it with a guest.
 *
 * Time is a fake clock, so the drawing takes no real time.
 */

const BASE = 'https://link.example.com';
const SIZE = { shape: 'rectangle', widthMm: 1200, heightMm: 800 } as const;

let current: TimedApp | undefined;

afterEach(async () => {
  await current?.app.close();
  current = undefined;
});

describe('admin -> customer -> table', () => {
  it('activation, roles, size, QR, claim, pairing and a simulated drawing', async () => {
    current = await createTimedApp({ PUBLIC_LINK_BASE_URL: BASE });
    const http = () => request(current!.app.getHttpServer());
    const admin = await signIn(current.app);

    // The admin creates the customer; the account waits for its activation code.
    const email = `client-${randomUUID()}@athar.test`;
    const created = customerAccessResponseSchema.parse(
      (
        await http()
          .post('/api/v1/admin/customers')
          .set(bearer(admin))
          .send({ email, displayName: 'Client' })
          .expect(201)
      ).body,
    );
    expect(created.account.status).toBe('pending-activation');

    // Until it activates, the customer cannot sign in.
    await http().post('/api/v1/auth/login').send({ email, password: TEST_PASSWORD }).expect(401);

    // Activation sets the password and signs in; the code works once.
    const customer: SessionResponse = sessionResponseSchema.parse(
      (
        await http()
          .post('/api/v1/auth/activate')
          .send({ email, activationCode: created.activationCode, password: TEST_PASSWORD })
          .expect(200)
      ).body,
    );
    expect(customer.account.role).toBe('customer');
    await http()
      .post('/api/v1/auth/activate')
      .send({ email, activationCode: created.activationCode, password: TEST_PASSWORD })
      .expect(400);

    // Roles: a customer is refused every admin route; an admin is refused the customer's.
    await http().get('/api/v1/admin/customers').set(bearer(customer)).expect(403);
    await http().get('/api/v1/admin/tables').set(bearer(customer)).expect(403);
    await http()
      .post('/api/v1/admin/tables/provision')
      .set(bearer(customer))
      .send({ displayName: 'Hall', location: 'Floor' })
      .expect(403);

    // The admin provisions a table with a size and a plan: nobody owns it yet.
    const provisioned = provisionTableResponseSchema.parse(
      (
        await http()
          .post('/api/v1/admin/tables/provision')
          .set(bearer(admin))
          .send({
            displayName: 'Salon',
            location: 'Ground floor',
            plan: 'personalized',
            geometry: SIZE,
            customerAccountId: customer.account.id,
          })
          .expect(201)
      ).body,
    );
    const tableId = provisioned.table.id;
    expect(provisioned.table).toMatchObject({
      ownerAccountId: null,
      reservedForAccountId: customer.account.id,
      geometry: SIZE,
    });
    expect(provisioned.pairing.accountId).toBe(customer.account.id);

    // A size that disagrees with its shape is refused, naming the field.
    await http()
      .post('/api/v1/admin/tables/provision')
      .set(bearer(admin))
      .send({
        displayName: 'Bad',
        location: 'Floor',
        customerAccountId: customer.account.id,
        geometry: { shape: 'rectangle', widthMm: 800, heightMm: 800 },
      })
      .expect(400);

    // The QR holds the public link of the table; the claim link holds the secret.
    const qr = tableQrResponseSchema.parse(
      (await http().get(`/api/v1/admin/tables/${tableId}/qr`).set(bearer(admin)).expect(200)).body,
    );
    expect(qr.link).toBe(`${BASE}/t/${tableId}`);
    expect(parsePairingLink(provisioned.pairing.link)).toMatchObject({
      tableId,
      token: provisioned.pairing.token,
    });

    // Before claiming, the customer cannot see the table.
    await http().get(`/api/v1/tables/${tableId}`).set(bearer(customer)).expect(404);

    // Another customer with the same QR code is turned away: it is for one customer only.
    const stranger = await signIn(current.app, 'customer');
    const turnedAway = await http()
      .post('/api/v1/tables/pair')
      .set(bearer(stranger))
      .send({ tableId, token: provisioned.pairing.token })
      .expect(403);
    expect(turnedAway.body).toMatchObject({ error: { code: 'PAIRING_WRONG_ACCOUNT' } });
    await http().get(`/api/v1/tables/${tableId}`).set(bearer(stranger)).expect(404);

    // Claiming makes the customer the owner.
    const claim = pairTableResponseSchema.parse(
      (
        await http()
          .post('/api/v1/tables/pair')
          .set(bearer(customer))
          .send({ tableId, token: provisioned.pairing.token })
          .expect(200)
      ).body,
    );
    expect(claim).toStrictEqual({ tableId, role: 'owner', expiresAt: null });

    // The owner sees the size and the plan's features, but cannot start yet: not paired.
    const read = async () =>
      getTableResponseSchema.parse(
        (await http().get(`/api/v1/tables/${tableId}`).set(bearer(customer)).expect(200)).body,
      );
    expect(await read()).toMatchObject({
      geometry: SIZE,
      plan: 'personalized',
      features: ['catalogue', 'rake', 'drawingPen', 'ledAmbiences'],
      access: { role: 'owner' },
      readiness: { paired: false, online: true, free: true, canStart: false },
    });
    const refused = await http()
      .post(`/api/v1/tables/${tableId}/jobs`)
      .set(bearer(customer))
      .send({ designId: 'star', clientRequestId: randomUUID() })
      .expect(409);
    expect(refused.body).toMatchObject({ error: { code: 'PAIRING_REQUIRED' } });

    // Pairing the session lets it start.
    await http().post(`/api/v1/tables/${tableId}/pairing`).set(bearer(customer)).expect(200);
    expect((await read()).readiness).toStrictEqual({
      paired: true,
      online: true,
      free: true,
      canStart: true,
    });

    // The simulated drawing: start, busy, then completed after its fake duration.
    const job = drawingJobSchema.parse(
      (
        await http()
          .post(`/api/v1/tables/${tableId}/jobs`)
          .set(bearer(customer))
          .send({ designId: 'star', clientRequestId: randomUUID() })
          .expect(201)
      ).body,
    );
    expect(job).toMatchObject({ tableId, mode: 'simulation', state: 'drawing' });
    expect(await read()).toMatchObject({ connection: 'busy', activeJobId: job.id });

    // An admin reads the job but cannot command it or start another: read only.
    await http().get(`/api/v1/jobs/${job.id}`).set(bearer(admin)).expect(200);
    await http().post(`/api/v1/jobs/${job.id}/stop`).set(bearer(admin)).expect(404);
    expect(
      (await http().get(`/api/v1/tables/${tableId}`).set(bearer(admin)).expect(200)).body,
    ).toMatchObject({ access: { role: 'admin' }, geometry: SIZE });

    await current.advance(3); // 300 s at speed 100
    const done = drawingJobSchema.parse(
      (await http().get(`/api/v1/jobs/${job.id}`).set(bearer(customer)).expect(200)).body,
    );
    expect(done).toMatchObject({ state: 'completed', progress: 1 });
    expect(await read()).toMatchObject({ connection: 'online', activeJobId: null });

    // The admin sees the owner on the stored record.
    const record = adminTableSchema.parse(
      (await http().get(`/api/v1/admin/tables/${tableId}`).set(bearer(admin)).expect(200)).body,
    );
    expect(record.ownerAccountId).toBe(customer.account.id);
  });

  it('a guest invited by the owner may command and light the table, but not share it', async () => {
    current = await createTimedApp({ PUBLIC_LINK_BASE_URL: BASE });
    const http = () => request(current!.app.getHttpServer());
    const admin = await signIn(current.app);
    const owner = await signIn(current.app, 'customer');
    const guest = await signIn(current.app, 'customer');

    const { table, pairing } = provisionTableResponseSchema.parse(
      (
        await http()
          .post('/api/v1/admin/tables/provision')
          .set(bearer(admin))
          .send({
            displayName: 'Salon',
            location: 'Floor',
            plan: 'personalized',
            geometry: SIZE,
            customerAccountId: owner.account.id,
          })
          .expect(201)
      ).body,
    );
    await http()
      .post('/api/v1/tables/pair')
      .set(bearer(owner))
      .send({ tableId: table.id, token: pairing.token })
      .expect(200);

    // The owner invites; the guest redeems the link and sees the size too.
    const share = (
      await http().post(`/api/v1/tables/${table.id}/shares`).set(bearer(owner)).send({}).expect(201)
    ).body as { link: string };
    const parsed = parsePairingLink(share.link);
    expect(parsed).not.toBeNull();
    await http()
      .post('/api/v1/tables/pair')
      .set(bearer(guest))
      .send({ tableId: table.id, token: parsed!.token })
      .expect(200);
    expect(
      (await http().get(`/api/v1/tables/${table.id}`).set(bearer(guest)).expect(200)).body,
    ).toMatchObject({ geometry: SIZE, access: { role: 'guest' } });

    // The guest pairs its own session, then sets a colour and a catalogue ambience.
    await http().post(`/api/v1/tables/${table.id}/pairing`).set(bearer(guest)).expect(200);
    await http()
      .put(`/api/v1/tables/${table.id}/light`)
      .set(bearer(guest))
      .send({ mode: 'color', color: '#ff8800', brightness: 50 })
      .expect(200);
    const [ambience] = listAmbiencesResponseSchema.parse(
      (await http().get('/api/v1/ambiences').set(bearer(guest)).expect(200)).body,
    ).ambiences;
    expect(
      (
        await http()
          .put(`/api/v1/tables/${table.id}/ambience`)
          .set(bearer(guest))
          .send({ ambienceId: ambience!.id })
          .expect(200)
      ).body,
    ).toMatchObject({ ambienceId: ambience!.id });

    // The guest starts a drawing; the owner sees it and the guest cannot share the table.
    const job = drawingJobSchema.parse(
      (
        await http()
          .post(`/api/v1/tables/${table.id}/jobs`)
          .set(bearer(guest))
          .send({ kind: 'rake', clientRequestId: randomUUID() })
          .expect(201)
      ).body,
    );
    await http().get(`/api/v1/jobs/${job.id}`).set(bearer(owner)).expect(200);
    await http().post(`/api/v1/tables/${table.id}/shares`).set(bearer(guest)).send({}).expect(404);
  });
});
