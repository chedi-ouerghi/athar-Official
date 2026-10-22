import { randomUUID } from 'node:crypto';
import {
  apiErrorResponseSchema,
  getTableResponseSchema,
  pairingSchema,
  sessionResponseSchema,
  type SessionResponse,
} from '@athar/contracts';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import {
  TEST_PASSWORD,
  bearer,
  createTimedApp,
  signIn,
  signInOwner,
  type TimedApp,
} from './create-test-app.js';

/**
 * The drawing conditions over HTTP (Phase 4): a job starts only when the caller
 * owns the table, it is enabled, this session is paired with it, it is online,
 * it is free and its plan includes the feature, checked in that order.
 */

let current: TimedApp | undefined;

afterEach(async () => {
  await current?.app.close();
  current = undefined;
});

const TABLE = 'table-001';
const MINUTE = 60;

async function setup() {
  current = await createTimedApp();
  const timed = current;
  const http = () => request(timed.app.getHttpServer());
  let owner = await signInOwner(timed.app, TABLE);
  const as = () => bearer(owner);

  return {
    timed,
    http,
    owner: () => owner,
    pair: (session: SessionResponse = owner) =>
      http().post(`/api/v1/tables/${TABLE}/pairing`).set(bearer(session)),
    unpair: () => http().delete(`/api/v1/tables/${TABLE}/pairing`).set(as()),
    start: (session: SessionResponse = owner) =>
      http()
        .post(`/api/v1/tables/${TABLE}/jobs`)
        .set(bearer(session))
        .send({ designId: 'star', clientRequestId: randomUUID() }),
    readiness: async (session: SessionResponse = owner) =>
      getTableResponseSchema.parse(
        (await http().get(`/api/v1/tables/${TABLE}`).set(bearer(session)).expect(200)).body,
      ).readiness,
    /** The access token lasts 15 minutes too: refresh it, keeping the same session. */
    refresh: async () => {
      owner = sessionResponseSchema.parse(
        (
          await http()
            .post('/api/v1/auth/refresh')
            .send({ refreshToken: owner.refreshToken })
            .expect(200)
        ).body,
      );
    },
    /** A second sign-in of the same owner: another session. */
    secondSession: async () =>
      sessionResponseSchema.parse(
        (
          await http()
            .post('/api/v1/auth/login')
            .send({ email: owner.account.email, password: TEST_PASSWORD })
            .expect(200)
        ).body,
      ),
    setEnabled: async (enabled: boolean) =>
      http()
        .patch(`/api/v1/admin/tables/${TABLE}`)
        .set(bearer(await signIn(timed.app)))
        .send({ enabled })
        .expect(200),
  };
}

const codeOf = async (pending: request.Test, status: number) =>
  apiErrorResponseSchema.parse((await pending.expect(status)).body).error.code;

describe('the drawing conditions', () => {
  it('starts a drawing when every condition is met', async () => {
    const api = await setup();

    const paired = pairingSchema.parse((await api.pair().expect(200)).body);
    expect(paired).toStrictEqual({
      tableId: TABLE,
      expiresAt: new Date(api.timed.clock.now() + 15 * MINUTE * 1000).toISOString(),
    });
    expect(await api.readiness()).toStrictEqual({
      paired: true,
      online: true,
      free: true,
      canStart: true,
    });

    await api.start().expect(201);
  });

  it('refuses anyone but the owner as if the table did not exist, before anything else', async () => {
    const api = await setup();
    const stranger = await signIn(api.timed.app, 'customer');
    await api.setEnabled(false);

    expect(await codeOf(api.start(stranger), 404)).toBe('TABLE_NOT_FOUND');
    expect(await codeOf(api.pair(stranger), 404)).toBe('TABLE_NOT_FOUND');
    expect(
      await codeOf(api.http().delete(`/api/v1/tables/${TABLE}/pairing`).set(bearer(stranger)), 404),
    ).toBe('TABLE_NOT_FOUND');
  });

  it('refuses a disabled table before asking for a pairing', async () => {
    const api = await setup();
    await api.setEnabled(false);

    expect(await codeOf(api.start(), 409)).toBe('TABLE_DISABLED');

    await api.pair().expect(200);
    expect(await api.readiness()).toMatchObject({ paired: true, canStart: false });
    expect(await codeOf(api.start(), 409)).toBe('TABLE_DISABLED');
  });

  it('needs a pairing before it asks whether the table is online', async () => {
    const api = await setup();
    api.timed.driver.simulateConnection(TABLE, 'offline');

    expect(await api.readiness()).toStrictEqual({
      paired: false,
      online: false,
      free: true,
      canStart: false,
    });
    expect(await codeOf(api.start(), 409)).toBe('PAIRING_REQUIRED');
  });

  it('refuses an offline table, then starts once it is back', async () => {
    const api = await setup();
    await api.pair().expect(200);

    for (const connection of ['offline', 'error'] as const) {
      api.timed.driver.simulateConnection(TABLE, connection);
      expect(await api.readiness()).toMatchObject({ online: false, canStart: false });
      expect(await codeOf(api.start(), 409)).toBe('TABLE_OFFLINE');
    }

    api.timed.driver.simulateConnection(TABLE, 'online');
    await api.start().expect(201);
  });

  it('refuses a busy table, and shows it is not free', async () => {
    const api = await setup();
    await api.pair().expect(200);
    await api.start().expect(201);

    expect(await api.readiness()).toStrictEqual({
      paired: true,
      online: true,
      free: false,
      canStart: false,
    });
    expect(await codeOf(api.start(), 409)).toBe('TABLE_BUSY');
  });

  it('lets the pairing expire 15 minutes after it was last used', async () => {
    const api = await setup();
    await api.pair().expect(200);

    api.timed.clock.advanceSeconds(15 * MINUTE);
    await api.refresh();

    expect((await api.readiness()).paired).toBe(false);
    expect(await codeOf(api.start(), 409)).toBe('PAIRING_REQUIRED');
  });

  it('keeps the pairing alive while the owner extends it, or uses it', async () => {
    const api = await setup();
    await api.pair().expect(200);

    api.timed.clock.advanceSeconds(10 * MINUTE);
    await api.pair().expect(200);
    api.timed.clock.advanceSeconds(10 * MINUTE);
    await api.refresh();
    expect((await api.readiness()).paired).toBe(true);

    // A command extends it too (a paused drawing waits for as long as it takes).
    const job = (await api.start().expect(201)).body as { id: string };
    const command = (name: string) =>
      api.http().post(`/api/v1/jobs/${job.id}/${name}`).set(bearer(api.owner())).expect(200);
    await command('pause');
    api.timed.clock.advanceSeconds(10 * MINUTE);
    await api.refresh();
    await command('resume');
    api.timed.clock.advanceSeconds(10 * MINUTE);
    await api.refresh();
    expect((await api.readiness()).paired).toBe(true);
  });

  it('unpairs, after which only stop, the safety action, is allowed', async () => {
    const api = await setup();
    await api.pair().expect(200);
    const job = (await api.start().expect(201)).body as { id: string };

    await api.unpair().expect(204);
    await api.unpair().expect(204);

    expect((await api.readiness()).paired).toBe(false);
    expect(await codeOf(api.start(), 409)).toBe('PAIRING_REQUIRED');
    for (const command of ['pause', 'resume']) {
      expect(
        await codeOf(
          api.http().post(`/api/v1/jobs/${job.id}/${command}`).set(bearer(api.owner())),
          409,
        ),
      ).toBe('PAIRING_REQUIRED');
    }
    await api.http().post(`/api/v1/jobs/${job.id}/stop`).set(bearer(api.owner())).expect(200);
    expect((await api.readiness()).paired).toBe(false);
  });

  it('pairs one session only: another sign-in of the same owner is not paired', async () => {
    const api = await setup();
    await api.pair().expect(200);
    const other = await api.secondSession();

    expect((await api.readiness(other)).paired).toBe(false);
    expect(await codeOf(api.start(other), 409)).toBe('PAIRING_REQUIRED');

    await api.pair(other).expect(200);
    await api.start(other).expect(201);
  });

  it('returns the original job for a repeated request even without a pairing', async () => {
    const api = await setup();
    await api.pair().expect(200);
    const body = { designId: 'star', clientRequestId: randomUUID() };
    const send = () =>
      api.http().post(`/api/v1/tables/${TABLE}/jobs`).set(bearer(api.owner())).send(body);
    const first = (await send().expect(201)).body as { id: string };

    await api.unpair().expect(204);

    expect(((await send().expect(200)).body as { id: string }).id).toBe(first.id);
  });

  it('never shows an admin as paired', async () => {
    const api = await setup();
    await api.pair().expect(200);

    expect(await api.readiness(await signIn(api.timed.app))).toMatchObject({
      paired: false,
      canStart: false,
    });
  });
});
