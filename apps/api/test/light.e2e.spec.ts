import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import {
  apiErrorResponseSchema,
  createShareResponseSchema,
  getTableResponseSchema,
  parsePairingLink,
  type Plan,
  type SessionResponse,
} from '@athar/contracts';
import { TableRegistry } from '../src/tables/table-registry.service.js';
import { bearer, createTimedApp, signIn, signInOwner, type TimedApp } from './create-test-app.js';

/**
 * `PUT /api/v1/tables/:tableId/light` over HTTP: off, on, any colour, or a named
 * ambience, for the owner or a guest of a table whose plan has `ledAmbiences`.
 */

let current: TimedApp | undefined;

afterEach(async () => {
  await current?.app.close();
  current = undefined;
});

const TABLE = 'table-001';

async function setup(plan: Plan = 'personalized') {
  current = await createTimedApp();
  const timed = current;
  const http = () => request(timed.app.getHttpServer());
  const owner = await signInOwner(timed.app, TABLE);
  await timed.app.get(TableRegistry).update(TABLE, { plan });

  const pair = (session: SessionResponse) =>
    http().post(`/api/v1/tables/${TABLE}/pairing`).set(bearer(session)).expect(200);
  const setLight = (session: SessionResponse, body: unknown) =>
    http()
      .put(`/api/v1/tables/${TABLE}/light`)
      .set(bearer(session))
      .send(body as object);
  const codeOf = async (pending: request.Test, status: number) =>
    apiErrorResponseSchema.parse((await pending.expect(status)).body).error.code;

  return { timed, http, owner, pair, setLight, codeOf };
}

describe('the light', () => {
  it('needs a session', async () => {
    const api = await setup();

    await api.http().put(`/api/v1/tables/${TABLE}/light`).send({ mode: 'on' }).expect(401);
  });

  it('turns on, off, to a colour and to a named ambience on a personalized table', async () => {
    const api = await setup();
    await api.pair(api.owner);

    for (const body of [
      { mode: 'on' },
      { mode: 'color', color: '#FF8800', brightness: 40 },
      { mode: 'color', color: '#00ff7f' },
      { mode: 'off' },
    ]) {
      const table = getTableResponseSchema.parse(
        (await api.setLight(api.owner, body).expect(200)).body,
      );

      // A colour, like on and off, is not a named ambience.
      expect(table.ambienceId).toBeNull();
    }

    const table = getTableResponseSchema.parse(
      (await api.setLight(api.owner, { mode: 'preset', ambienceId: 'amber' }).expect(200)).body,
    );

    expect(table.ambienceId).toBe('amber');
  });

  it('is not in the basic plan', async () => {
    const api = await setup('basic');
    await api.pair(api.owner);

    expect(await api.codeOf(api.setLight(api.owner, { mode: 'on' }), 403)).toBe(
      'FEATURE_NOT_IN_PLAN',
    );
  });

  it('needs the session to be paired with the table', async () => {
    const api = await setup();

    expect(await api.codeOf(api.setLight(api.owner, { mode: 'on' }), 409)).toBe('PAIRING_REQUIRED');
  });

  it('is refused for a table that is offline', async () => {
    const api = await setup();
    await api.pair(api.owner);
    api.timed.driver.simulateConnection(TABLE, 'offline');

    expect(await api.codeOf(api.setLight(api.owner, { mode: 'off' }), 409)).toBe('TABLE_OFFLINE');
  });

  it('refuses a body that is not a light, with VALIDATION_FAILED', async () => {
    const api = await setup();
    await api.pair(api.owner);

    for (const body of [
      {},
      { mode: 'strobe' },
      { mode: 'color' },
      { mode: 'color', color: '#12' },
      { mode: 'color', color: 'red' },
      { mode: 'color', color: '#ff0000', brightness: 0 },
      { mode: 'color', color: '#ff0000', brightness: 101 },
      { mode: 'preset' },
      { mode: 'preset', ambienceId: 'no-such-ambience' },
    ]) {
      expect(await api.codeOf(api.setLight(api.owner, body), 400), JSON.stringify(body)).toBe(
        'VALIDATION_FAILED',
      );
    }
  });

  it('is not for a stranger, who is told the table does not exist', async () => {
    const api = await setup();
    const stranger = await signIn(api.timed.app, 'customer');

    expect(await api.codeOf(api.setLight(stranger, { mode: 'on' }), 404)).toBe('TABLE_NOT_FOUND');
  });

  it('is for a guest too, until the shared link ends', async () => {
    const api = await setup();
    const guest = await signIn(api.timed.app, 'customer');
    const shared = createShareResponseSchema.parse(
      (
        await api
          .http()
          .post(`/api/v1/tables/${TABLE}/shares`)
          .set(bearer(api.owner))
          .send({ expiresInHours: 1 })
          .expect(201)
      ).body,
    );
    const link = parsePairingLink(shared.link);
    await api
      .http()
      .post('/api/v1/tables/pair')
      .set(bearer(guest))
      .send({ tableId: TABLE, token: link?.token })
      .expect(200);
    await api.pair(guest);

    await api.setLight(guest, { mode: 'color', color: '#112233' }).expect(200);
  });
});
