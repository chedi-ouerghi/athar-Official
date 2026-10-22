import { randomUUID } from 'node:crypto';
import {
  DRAWING_PATH_MAX_POINTS,
  apiErrorResponseSchema,
  drawingJobSchema,
  getTableResponseSchema,
  listAmbiencesResponseSchema,
  type Plan,
} from '@athar/contracts';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { TableRegistry } from '../src/tables/table-registry.service.js';
import { bearer, createTimedApp, signInOwner, type TimedApp } from './create-test-app.js';

/**
 * The advanced table features over HTTP (Phase 5): the rake, the drawing pen
 * (a freehand path) and the LED ambiences, each gated by the table's plan.
 */

let current: TimedApp | undefined;

afterEach(async () => {
  await current?.app.close();
  current = undefined;
});

const TABLE = 'table-001';
const STROKE = [
  [0, 0.3],
  [1.5, 0.8],
  [3, 0.5],
];

async function setup(plan: Plan = 'basic') {
  current = await createTimedApp();
  const timed = current;
  const http = () => request(timed.app.getHttpServer());
  const owner = await signInOwner(timed.app, TABLE);
  await timed.app.get(TableRegistry).update(TABLE, { plan });
  const as = bearer(owner);

  return {
    timed,
    http,
    as,
    pair: () => http().post(`/api/v1/tables/${TABLE}/pairing`).set(as).expect(200),
    start: (body: object) => http().post(`/api/v1/tables/${TABLE}/jobs`).set(as).send(body),
    setAmbience: (ambienceId: string) =>
      http().put(`/api/v1/tables/${TABLE}/ambience`).set(as).send({ ambienceId }),
    table: async () =>
      getTableResponseSchema.parse(
        (await http().get(`/api/v1/tables/${TABLE}`).set(as).expect(200)).body,
      ),
    job: async (id: string) =>
      drawingJobSchema.parse((await http().get(`/api/v1/jobs/${id}`).set(as).expect(200)).body),
  };
}

const codeOf = async (pending: request.Test, status: number) =>
  apiErrorResponseSchema.parse((await pending.expect(status)).body).error.code;

describe('the rake', () => {
  it('runs on a basic plan as a normal job, and completes', async () => {
    const api = await setup('basic');
    await api.pair();

    const job = drawingJobSchema.parse(
      (await api.start({ kind: 'rake', clientRequestId: randomUUID() }).expect(201)).body,
    );
    expect(job).toMatchObject({ kind: 'rake', designId: null, state: 'drawing' });

    await api.timed.advance(60);
    expect((await api.job(job.id)).state).toBe('completed');
  });
});

describe('the drawing pen', () => {
  it('is not in the basic plan', async () => {
    const api = await setup('basic');
    await api.pair();

    expect(
      await codeOf(api.start({ kind: 'path', path: STROKE, clientRequestId: randomUUID() }), 403),
    ).toBe('FEATURE_NOT_IN_PLAN');
  });

  it('draws a freehand path on a personalized plan, and completes', async () => {
    const api = await setup('personalized');
    await api.pair();

    const job = drawingJobSchema.parse(
      (await api.start({ kind: 'path', path: STROKE, clientRequestId: randomUUID() }).expect(201))
        .body,
    );
    expect(job).toMatchObject({ kind: 'path', designId: null, state: 'drawing' });

    await api.timed.advance(60);
    expect(await api.job(job.id)).toMatchObject({ state: 'completed', progress: 1 });
  });

  it('replays the same path, and refuses the same request id for another path', async () => {
    const api = await setup('personalized');
    await api.pair();
    const clientRequestId = randomUUID();
    const first = await api.start({ kind: 'path', path: STROKE, clientRequestId }).expect(201);

    const again = await api.start({ kind: 'path', path: STROKE, clientRequestId }).expect(200);
    expect((again.body as { id: string }).id).toBe((first.body as { id: string }).id);

    const other = STROKE.map(([theta, rho]) => [theta, (rho ?? 0) / 2]);
    expect(await codeOf(api.start({ kind: 'path', path: other, clientRequestId }), 409)).toBe(
      'IDEMPOTENCY_CONFLICT',
    );
    expect(await codeOf(api.start({ kind: 'rake', clientRequestId }), 409)).toBe(
      'IDEMPOTENCY_CONFLICT',
    );
  });

  it.each([
    [
      'more points than the limit',
      Array.from({ length: DRAWING_PATH_MAX_POINTS + 1 }, (_, i) => [i / 100, 0.5]),
    ],
    [
      'a path too long to draw',
      Array.from({ length: 100 }, (_, i) => [i % 2 === 0 ? 0 : Math.PI, 1]),
    ],
    [
      'a point off the table',
      [
        [0, 0.5],
        [1, 1.5],
      ],
    ],
  ])('refuses %s with VALIDATION_FAILED', async (_label, path) => {
    const api = await setup('personalized');
    await api.pair();

    expect(
      await codeOf(api.start({ kind: 'path', path, clientRequestId: randomUUID() }), 400),
    ).toBe('VALIDATION_FAILED');
  });
});

describe('the LED ambiences', () => {
  it('lists the three named ambiences, behind a session', async () => {
    const api = await setup();

    await api.http().get('/api/v1/ambiences').expect(401);
    const { ambiences } = listAmbiencesResponseSchema.parse(
      (await api.http().get('/api/v1/ambiences').set(api.as).expect(200)).body,
    );
    expect(ambiences.map((ambience) => ambience.id)).toStrictEqual(['gulf-blue', 'amber', 'pearl']);
  });

  it('sets the ambience on a personalized table, even while it draws', async () => {
    const api = await setup('personalized');
    await api.pair();
    expect((await api.table()).ambienceId).toBeNull();

    const table = getTableResponseSchema.parse((await api.setAmbience('amber').expect(200)).body);
    expect(table.ambienceId).toBe('amber');

    await api.start({ designId: 'star', clientRequestId: randomUUID() }).expect(201);
    await api.setAmbience('pearl').expect(200);
    expect(await api.table()).toMatchObject({ ambienceId: 'pearl', connection: 'busy' });
  });

  it('is not in the basic plan', async () => {
    const api = await setup('basic');
    await api.pair();

    expect(await codeOf(api.setAmbience('amber'), 403)).toBe('FEATURE_NOT_IN_PLAN');
  });

  it('needs a pairing, then an online table', async () => {
    const api = await setup('personalized');

    expect(await codeOf(api.setAmbience('amber'), 409)).toBe('PAIRING_REQUIRED');

    await api.pair();
    api.timed.driver.simulateConnection(TABLE, 'offline');
    expect(await codeOf(api.setAmbience('amber'), 409)).toBe('TABLE_OFFLINE');
  });

  it('refuses an unknown ambience with VALIDATION_FAILED', async () => {
    const api = await setup('personalized');
    await api.pair();

    expect(await codeOf(api.setAmbience('ultraviolet'), 400)).toBe('VALIDATION_FAILED');
    expect(await codeOf(api.setAmbience('Not An Id'), 400)).toBe('VALIDATION_FAILED');
  });
});
