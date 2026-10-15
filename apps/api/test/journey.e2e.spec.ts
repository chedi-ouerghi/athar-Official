import { randomUUID } from 'node:crypto';
import {
  adminTableSchema,
  apiErrorResponseSchema,
  drawingJobSchema,
  getTableResponseSchema,
  listDesignsResponseSchema,
  listJobsResponseSchema,
  readyResponseSchema,
  type DrawingJob,
} from '@athar/contracts';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { InMemoryTableRepository } from '../src/tables/in-memory-table.repository.js';
import { bearer, createTimedApp, signIn, type TimedApp } from './create-test-app.js';
import { fixtureTables } from './table-fixtures.js';

/**
 * The whole journey over HTTP, through the real application: a table provisioned
 * through the admin API, a visitor browsing designs and drawing one on the
 * simulated table, and everything that can go wrong on the way.
 *
 * Time is a fake clock and the speed factor is 100, so a five-minute design takes
 * three seconds of fake time, advanced by hand: nothing here waits.
 */

let current: TimedApp | undefined;

afterEach(async () => {
  await current?.app.close();
  current = undefined;
});

/**
 * Everything a test does over HTTP, with the answers parsed against the shared
 * contracts. Every request is the signed-in customer's, who owns every table
 * `createTable` registers (and any table `claim`ed); the admin calls set their
 * own header over it.
 */
async function client(timed: TimedApp) {
  const customer = await signIn(timed.app, 'customer');
  const http = () => request.agent(timed.app.getHttpServer()).set(bearer(customer));
  const job = (body: unknown): DrawingJob => drawingJobSchema.parse(body);
  const errorOf = (body: unknown) => apiErrorResponseSchema.parse(body).error;

  // A fresh admin session each time: the fake clock may have outlived the last one.
  const admin = async () => bearer(await signIn(timed.app));

  return {
    http,
    job,
    errorOf,
    admin,

    async createTable(overrides: Record<string, unknown> = {}): Promise<string> {
      const response = await http()
        .post('/api/v1/admin/tables')
        .set(await admin())
        .send({
          displayName: 'Main hall',
          location: 'Ground floor',
          ownerAccountId: customer.account.id,
          ...overrides,
        })
        .expect(201);

      return adminTableSchema.parse(response.body).id;
    },

    /** Make the customer the owner of an existing (fixture) table. */
    async claim(tableId: string): Promise<void> {
      await http()
        .patch(`/api/v1/admin/tables/${tableId}`)
        .set(await admin())
        .send({ ownerAccountId: customer.account.id })
        .expect(200);
    },

    start: (tableId: string, designId = 'star', clientRequestId: string = randomUUID()) =>
      http().post(`/api/v1/tables/${tableId}/jobs`).send({ designId, clientRequestId }),

    getJob: (jobId: string) => http().get(`/api/v1/jobs/${jobId}`),
    command: (jobId: string, command: 'pause' | 'resume' | 'stop') =>
      http().post(`/api/v1/jobs/${jobId}/${command}`),
    getTable: (tableId: string) => http().get(`/api/v1/tables/${tableId}`),
    history: (tableId: string, query = '') => http().get(`/api/v1/tables/${tableId}/jobs${query}`),
  };
}

describe('the full journey', () => {
  it('scan, browse, pick, draw, pause, resume, complete, and start again', async () => {
    current = await createTimedApp();
    const api = await client(current);

    // An administrator registers the table. The server chooses its id.
    const tableId = await api.createTable();
    expect(tableId).toMatch(/^[a-z2-7]{16}$/);

    // The owner scans its code and the app asks for the table.
    const table = getTableResponseSchema.parse((await api.getTable(tableId).expect(200)).body);
    expect(table).toStrictEqual({
      id: tableId,
      displayName: 'Main hall',
      location: 'Ground floor',
      enabled: true,
      mode: 'simulation',
      connection: 'online',
      activeJobId: null,
      plan: 'basic',
      voiceAssistant: false,
      features: ['catalogue', 'rake'],
    });

    // The app lists the four designs and the visitor picks one.
    const designs = listDesignsResponseSchema.parse(
      (await api.http().get('/api/v1/designs').expect(200)).body,
    );
    expect(designs.designs).toHaveLength(4);
    const star = designs.designs.find((design) => design.id === 'star')!;
    expect(star.estimatedDurationSeconds).toBe(300);

    // Start drawing: a new job, already accepted by the table.
    const clientRequestId = randomUUID();
    const started = await api.start(tableId, 'star', clientRequestId).expect(201);
    const job = api.job(started.body);

    expect(job).toMatchObject({
      tableId,
      designId: 'star',
      mode: 'simulation',
      state: 'drawing',
      progress: 0,
      finishedAt: null,
      errorCode: null,
    });
    expect(job.startedAt).not.toBeNull();

    // The table now shows it is busy, and which job it is running.
    expect((await api.getTable(tableId).expect(200)).body).toMatchObject({
      connection: 'busy',
      activeJobId: job.id,
    });

    // A double tap: the same request again returns the same job, with 200.
    const replay = await api.start(tableId, 'star', clientRequestId).expect(200);
    expect(api.job(replay.body).id).toBe(job.id);

    // A second visitor, or a deliberate second start, finds the table busy.
    const busy = await api.start(tableId, 'star').expect(409);
    expect(api.errorOf(busy.body)).toMatchObject({ code: 'TABLE_BUSY' });

    // The same request id with another design is a conflict, not a replay.
    const conflict = await api.start(tableId, 'dunes', clientRequestId).expect(409);
    expect(api.errorOf(conflict.body).code).toBe('IDEMPOTENCY_CONFLICT');

    // Watching progress: one second of the three it takes.
    await current.advance(1);
    const watching = api.job((await api.getJob(job.id).expect(200)).body);
    expect(watching.state).toBe('drawing');
    expect(watching.progress).toBeCloseTo(1 / 3, 5);

    // Pause: progress freezes however long it waits.
    const paused = api.job((await api.command(job.id, 'pause').expect(200)).body);
    expect(paused.state).toBe('paused');
    const frozenAt = paused.progress;
    await current.advance(60);
    const stillPaused = api.job((await api.getJob(job.id).expect(200)).body);
    expect(stillPaused).toMatchObject({ state: 'paused', progress: frozenAt });
    // A paused table is still busy.
    expect((await api.start(tableId).expect(409)).body).toMatchObject({
      error: { code: 'TABLE_BUSY' },
    });

    // Pausing again is not allowed, and says what state the job is in.
    const again = await api.command(job.id, 'pause').expect(409);
    expect(api.errorOf(again.body)).toMatchObject({
      code: 'INVALID_TRANSITION',
      message: 'Cannot pause a job that is paused.',
    });

    // Resume: it carries on from where it stopped, then completes.
    const resumed = api.job((await api.command(job.id, 'resume').expect(200)).body);
    expect(resumed.state).toBe('drawing');
    await current.advance(1);
    const later = api.job((await api.getJob(job.id).expect(200)).body);
    expect(later.progress).toBeCloseTo((1 + 1) / 3, 5);

    await current.advance(2);
    const completed = api.job((await api.getJob(job.id).expect(200)).body);
    expect(completed).toMatchObject({ state: 'completed', progress: 1, errorCode: null });
    expect(completed.finishedAt).not.toBeNull();

    // The table is free again, and nothing more can be done to the finished job.
    expect((await api.getTable(tableId).expect(200)).body).toMatchObject({
      connection: 'online',
      activeJobId: null,
    });
    for (const command of ['pause', 'resume', 'stop'] as const) {
      const rejected = await api.command(job.id, command).expect(409);
      expect(api.errorOf(rejected.body)).toMatchObject({
        code: 'INVALID_TRANSITION',
        message: `Cannot ${command} a job that is completed.`,
      });
    }

    // Replaying the old request still finds the finished job: it does not draw again.
    const afterwards = await api.start(tableId, 'star', clientRequestId).expect(200);
    expect(api.job(afterwards.body)).toMatchObject({ id: job.id, state: 'completed' });

    // Start again: a fresh request id, a new job, a different design this time.
    const second = api.job((await api.start(tableId, 'sadu').expect(201)).body);
    expect(second.id).not.toBe(job.id);
    expect(second.designId).toBe('sadu');
    await current.advance(7); // 690 seconds at speed 100 is 6.9
    expect(api.job((await api.getJob(second.id).expect(200)).body).state).toBe('completed');

    // History: both jobs, newest first.
    const history = listJobsResponseSchema.parse((await api.history(tableId).expect(200)).body);
    expect(history.jobs.map((j) => j.id)).toStrictEqual([second.id, job.id]);
    expect(history.jobs.map((j) => j.state)).toStrictEqual(['completed', 'completed']);
    expect(
      listJobsResponseSchema.parse((await api.history(tableId, '?limit=1').expect(200)).body).jobs,
    ).toHaveLength(1);
  });

  it('reports itself ready, naming the table mode', async () => {
    current = await createTimedApp();
    const api = await client(current);
    await api.createTable();

    const ready = readyResponseSchema.parse((await api.http().get('/ready').expect(200)).body);

    expect(ready.status).toBe('ok');
    expect(ready.tableMode).toBe('simulation');
    expect(ready.checks.map((check) => [check.name, check.status])).toStrictEqual([
      ['configuration', 'ok'],
      ['event-loop', 'ok'],
      ['table-driver', 'ok'],
    ]);

    // Liveness is untouched.
    const health = (await api.http().get('/health').expect(200)).body as object;
    expect(Object.keys(health).sort()).toStrictEqual([
      'service',
      'status',
      'timestamp',
      'uptimeSeconds',
      'version',
    ]);
  });
});

describe('when things go wrong', () => {
  it('a simulated fault ends the job with SIMULATED_FAULT and frees the table', async () => {
    current = await createTimedApp({
      SIMULATION_FAULT_EVERY_NTH_JOB: '1',
      SIMULATION_FAULT_AT_PROGRESS: '0.5',
    });
    const api = await client(current);
    const tableId = await api.createTable();
    const job = api.job((await api.start(tableId).expect(201)).body);

    await current.advance(1);
    expect(api.job((await api.getJob(job.id).expect(200)).body).state).toBe('drawing');

    await current.advance(1); // progress 0.667: past the fault at 0.5
    const failed = api.job((await api.getJob(job.id).expect(200)).body);

    expect(failed).toMatchObject({ state: 'failed', errorCode: 'SIMULATED_FAULT', progress: 0.5 });
    expect(failed.finishedAt).not.toBeNull();
    expect(failed.progress).toBeLessThan(1);
    expect((await api.getTable(tableId).expect(200)).body).toMatchObject({
      connection: 'online',
      activeJobId: null,
    });
    expect((await api.command(job.id, 'stop').expect(409)).body).toMatchObject({
      error: { code: 'INVALID_TRANSITION' },
    });
    // "Start again" works.
    await api.start(tableId).expect(201);
  });

  it('stop ends a job where it stands, and the table can be used again', async () => {
    current = await createTimedApp();
    const api = await client(current);
    const tableId = await api.createTable();
    const job = api.job((await api.start(tableId).expect(201)).body);
    await current.advance(1);

    const stopped = api.job((await api.command(job.id, 'stop').expect(200)).body);

    expect(stopped.state).toBe('cancelled');
    expect(stopped.progress).toBeCloseTo(1 / 3, 5);
    expect(stopped.finishedAt).not.toBeNull();
    await current.advance(30);
    expect(api.job((await api.getJob(job.id).expect(200)).body)).toStrictEqual(stopped);
    expect((await api.command(job.id, 'stop').expect(409)).body).toMatchObject({
      error: { message: 'Cannot stop a job that is cancelled.' },
    });
    await api.start(tableId).expect(201);
  });

  it('stop works on a paused job', async () => {
    current = await createTimedApp();
    const api = await client(current);
    const tableId = await api.createTable();
    const job = api.job((await api.start(tableId).expect(201)).body);
    await api.command(job.id, 'pause').expect(200);

    expect(api.job((await api.command(job.id, 'stop').expect(200)).body).state).toBe('cancelled');
  });

  it('resume on a job that is drawing is not allowed', async () => {
    current = await createTimedApp();
    const api = await client(current);
    const tableId = await api.createTable();
    const job = api.job((await api.start(tableId).expect(201)).body);

    expect((await api.command(job.id, 'resume').expect(409)).body).toMatchObject({
      error: { code: 'INVALID_TRANSITION', message: 'Cannot resume a job that is drawing.' },
    });
  });

  it('an offline table refuses a new job with TABLE_OFFLINE, and accepts one when it is back', async () => {
    current = await createTimedApp();
    const api = await client(current);
    const tableId = await api.createTable();

    current.driver.simulateConnection(tableId, 'offline');

    expect((await api.getTable(tableId).expect(200)).body).toMatchObject({ connection: 'offline' });
    expect(api.errorOf((await api.start(tableId).expect(409)).body).code).toBe('TABLE_OFFLINE');

    current.driver.simulateConnection(tableId, 'error');
    expect(api.errorOf((await api.start(tableId).expect(409)).body).code).toBe('TABLE_OFFLINE');

    current.driver.simulateConnection(tableId, 'online');
    await api.start(tableId).expect(201);
  });

  it('a table that goes offline mid-drawing fails the job with OFFLINE and keeps its progress', async () => {
    current = await createTimedApp();
    const api = await client(current);
    const tableId = await api.createTable();
    const job = api.job((await api.start(tableId).expect(201)).body);
    await current.advance(1);

    current.driver.simulateConnection(tableId, 'offline');
    await current.settle();

    const failed = api.job((await api.getJob(job.id).expect(200)).body);
    expect(failed).toMatchObject({ state: 'failed', errorCode: 'OFFLINE' });
    expect(failed.progress).toBeCloseTo(1 / 3, 5);
    expect((await api.getTable(tableId).expect(200)).body).toMatchObject({
      connection: 'offline',
      activeJobId: null,
    });
  });

  it('a table that goes offline while paused fails the job too', async () => {
    current = await createTimedApp();
    const api = await client(current);
    const tableId = await api.createTable();
    const job = api.job((await api.start(tableId).expect(201)).body);
    await api.command(job.id, 'pause').expect(200);

    current.driver.simulateConnection(tableId, 'offline');
    await current.settle();

    expect(api.job((await api.getJob(job.id).expect(200)).body)).toMatchObject({
      state: 'failed',
      errorCode: 'OFFLINE',
    });
  });

  it('a disabled table refuses new jobs with TABLE_DISABLED, but still shows itself and lets a running job be stopped', async () => {
    current = await createTimedApp();
    const api = await client(current);
    const tableId = await api.createTable();
    const clientRequestId = randomUUID();
    const job = api.job((await api.start(tableId, 'star', clientRequestId).expect(201)).body);

    await api
      .http()
      .patch(`/api/v1/admin/tables/${tableId}`)
      .set(await api.admin())
      .send({ enabled: false })
      .expect(200);

    // Reads still work, and say it is disabled.
    expect((await api.getTable(tableId).expect(200)).body).toMatchObject({
      enabled: false,
      activeJobId: job.id,
    });
    // The same request still finds its job: a repeat is answered before the table is checked.
    expect((await api.start(tableId, 'star', clientRequestId).expect(200)).body).toMatchObject({
      id: job.id,
    });
    // A new request is refused for being disabled, ahead of being busy.
    expect(api.errorOf((await api.start(tableId).expect(409)).body).code).toBe('TABLE_DISABLED');
    // The running job can still be stopped.
    expect(api.job((await api.command(job.id, 'stop').expect(200)).body).state).toBe('cancelled');
    // And afterwards, nothing new may start.
    expect(api.errorOf((await api.start(tableId).expect(409)).body).code).toBe('TABLE_DISABLED');
  });

  it('a disabled fixture table is returned with enabled: false and refuses jobs', async () => {
    current = await createTimedApp();
    const api = await client(current);
    await api.claim('table-off');

    expect((await api.getTable('table-off').expect(200)).body).toMatchObject({ enabled: false });
    expect(api.errorOf((await api.start('table-off').expect(409)).body).code).toBe(
      'TABLE_DISABLED',
    );
  });

  describe('unknown ids, in the documented order', () => {
    it('an unknown table is TABLE_NOT_FOUND, checked before the design', async () => {
      current = await createTimedApp();
      const api = await client(current);

      const response = await api.start('no-such-table', 'no-such-design').expect(404);

      expect(api.errorOf(response.body).code).toBe('TABLE_NOT_FOUND');
    });

    it('an unknown design on a real table is DESIGN_NOT_FOUND', async () => {
      current = await createTimedApp();
      const api = await client(current);
      const tableId = await api.createTable();

      expect(api.errorOf((await api.start(tableId, 'no-such-design').expect(404)).body).code).toBe(
        'DESIGN_NOT_FOUND',
      );
    });

    it('the design is checked before a repeat, a disabled table or a busy one', async () => {
      current = await createTimedApp();
      const api = await client(current);
      const tableId = await api.createTable();
      await api.start(tableId).expect(201);

      expect(api.errorOf((await api.start(tableId, 'no-such-design').expect(404)).body).code).toBe(
        'DESIGN_NOT_FOUND',
      );
    });

    it('an unknown job is JOB_NOT_FOUND, for a read and for every command', async () => {
      current = await createTimedApp();
      const api = await client(current);
      const unknown = randomUUID();

      expect(api.errorOf((await api.getJob(unknown).expect(404)).body).code).toBe('JOB_NOT_FOUND');
      for (const command of ['pause', 'resume', 'stop'] as const) {
        expect(api.errorOf((await api.command(unknown, command).expect(404)).body).code).toBe(
          'JOB_NOT_FOUND',
        );
      }
    });

    it('history for an unknown table is TABLE_NOT_FOUND', async () => {
      current = await createTimedApp();
      const api = await client(current);

      expect(api.errorOf((await api.history('no-such-table').expect(404)).body).code).toBe(
        'TABLE_NOT_FOUND',
      );
    });

    it('history for a table with no jobs is empty, not an error', async () => {
      current = await createTimedApp();
      const api = await client(current);
      const tableId = await api.createTable();

      expect((await api.history(tableId).expect(200)).body).toStrictEqual({ jobs: [] });
    });
  });

  describe('validation', () => {
    it.each([
      [
        'a clientRequestId that is not a UUID',
        { designId: 'star', clientRequestId: 'tap-tap' },
        'body.clientRequestId',
      ],
      ['a missing clientRequestId', { designId: 'star' }, 'body.clientRequestId'],
      ['a missing designId', { clientRequestId: randomUUID() }, 'body.designId'],
      [
        'an invalid designId',
        { designId: 'Star Design', clientRequestId: randomUUID() },
        'body.designId',
      ],
    ])('rejects %s', async (_label, body, path) => {
      current = await createTimedApp();
      const api = await client(current);
      const tableId = await api.createTable();

      const response = await api
        .http()
        .post(`/api/v1/tables/${tableId}/jobs`)
        .send(body)
        .expect(400);

      expect(api.errorOf(response.body)).toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(api.errorOf(response.body).details?.map((detail) => detail.path)).toContain(path);
    });

    it('rejects an invalid table id and an invalid job id', async () => {
      current = await createTimedApp();
      const api = await client(current);

      expect((await api.start('NOT_VALID').expect(400)).body).toMatchObject({
        error: { code: 'VALIDATION_FAILED' },
      });
      expect((await api.getJob('not-a-uuid').expect(400)).body).toMatchObject({
        error: { code: 'VALIDATION_FAILED' },
      });
      expect((await api.command('not-a-uuid', 'stop').expect(400)).body).toMatchObject({
        error: { code: 'VALIDATION_FAILED' },
      });
    });

    it.each(['0', '101', '-1', 'abc', '1.5'])('rejects the history limit %s', async (limit) => {
      current = await createTimedApp();
      const api = await client(current);
      const tableId = await api.createTable();

      const response = await api.history(tableId, `?limit=${limit}`).expect(400);

      expect(api.errorOf(response.body).details?.[0]?.path).toBe('query.limit');
    });

    it('accepts a command with no body, an empty object, or extra keys it ignores', async () => {
      current = await createTimedApp();
      const api = await client(current);
      const tableId = await api.createTable();
      const job = api.job((await api.start(tableId).expect(201)).body);

      await api.command(job.id, 'pause').expect(200);
      await api.http().post(`/api/v1/jobs/${job.id}/resume`).send({}).expect(200);
      await api.http().post(`/api/v1/jobs/${job.id}/pause`).send({ surprise: true }).expect(200);
    });

    it('rejects a command whose body is not an object', async () => {
      current = await createTimedApp();
      const api = await client(current);
      const tableId = await api.createTable();
      const job = api.job((await api.start(tableId).expect(201)).body);

      await api
        .http()
        .post(`/api/v1/jobs/${job.id}/pause`)
        .set('content-type', 'application/json')
        .send('[1, 2]')
        .expect(400);
    });
  });

  it('when the driver refuses the job, the job exists, is failed with the driver’s code, and the table is free', async () => {
    current = await createTimedApp();
    const api = await client(current);
    const tableId = await api.createTable();
    // Something outside the jobs module has the table busy: the driver will say BUSY.
    await current.driver.startJob(tableId, {
      jobId: 'someone-elses-job',
      trajectory: {
        format: 'polar-theta-rho/v1',
        points: [
          [0, 0],
          [1, 0.5],
          [2, 0],
        ],
      },
    });

    const response = await api.start(tableId).expect(201);

    expect(api.job(response.body)).toMatchObject({
      state: 'failed',
      errorCode: 'BUSY',
      progress: 0,
    });
    expect(await current.jobs.activeJobIdFor(tableId)).toBeNull();
    expect((await api.history(tableId).expect(200)).body).toMatchObject({
      jobs: [{ state: 'failed', errorCode: 'BUSY' }],
    });
  });

  it('the failed job stays failed: the driver’s later events do not revive it', async () => {
    current = await createTimedApp();
    const api = await client(current);
    const tableId = await api.createTable();
    await current.driver.startJob(tableId, {
      jobId: 'someone-elses-job',
      trajectory: {
        format: 'polar-theta-rho/v1',
        points: [
          [0, 0],
          [1, 0.5],
          [2, 0],
        ],
      },
      estimatedDurationSeconds: 1,
    });
    const job = api.job((await api.start(tableId).expect(201)).body);

    await current.advance(5);

    expect(api.job((await api.getJob(job.id).expect(200)).body).state).toBe('failed');
  });
});

describe('simultaneous requests', () => {
  it('five identical taps at once create one job: one 201, four 200s, all the same job', async () => {
    current = await createTimedApp();
    const api = await client(current);
    const tableId = await api.createTable();
    const clientRequestId = randomUUID();

    const responses = await Promise.all(
      Array.from({ length: 5 }, () => api.start(tableId, 'star', clientRequestId)),
    );

    expect(responses.map((response) => response.status).sort()).toStrictEqual([
      200, 200, 200, 200, 201,
    ]);
    expect(new Set(responses.map((response) => api.job(response.body).id)).size).toBe(1);
    expect(
      ((await api.history(tableId).expect(200)).body as { jobs: unknown[] }).jobs,
    ).toHaveLength(1);
  });

  it('five different requests at once start one job and refuse four with TABLE_BUSY', async () => {
    current = await createTimedApp();
    const api = await client(current);
    const tableId = await api.createTable();

    const responses = await Promise.all(Array.from({ length: 5 }, () => api.start(tableId)));

    expect(responses.map((response) => response.status).sort()).toStrictEqual([
      201, 409, 409, 409, 409,
    ]);
    for (const response of responses.filter((r) => r.status === 409)) {
      expect(api.errorOf(response.body).code).toBe('TABLE_BUSY');
    }
    expect(
      ((await api.history(tableId).expect(200)).body as { jobs: unknown[] }).jobs,
    ).toHaveLength(1);
  });

  it('two tables draw at the same time, independently', async () => {
    current = await createTimedApp();
    const api = await client(current);
    const first = await api.createTable();
    const second = await api.createTable({ displayName: 'Lobby' });

    const [a, b] = await Promise.all([api.start(first, 'star'), api.start(second, 'sadu')]);
    await current.advance(1);

    expect(api.job(a.body).tableId).toBe(first);
    expect(api.job(b.body).tableId).toBe(second);
    expect((await api.getTable(first).expect(200)).body).toMatchObject({
      activeJobId: api.job(a.body).id,
    });
    expect((await api.getTable(second).expect(200)).body).toMatchObject({
      activeJobId: api.job(b.body).id,
    });
  });

  it('a stop that races a completion comes out one way or the other, never both', async () => {
    current = await createTimedApp();
    const api = await client(current);
    const tableId = await api.createTable();
    const job = api.job((await api.start(tableId).expect(201)).body);

    // The clock passes the end of the drawing, but no tick has told the job yet.
    current.clock.advanceSeconds(10);
    const response = await api.command(job.id, 'stop');

    expect([200, 409]).toContain(response.status);
    const final = api.job((await api.getJob(job.id).expect(200)).body);
    // The driver noticed the drawing was over before the stop reached it.
    expect(final.state).toBe('completed');
    expect(response.status).toBe(409);
    expect(api.errorOf(response.body).message).toBe('Cannot stop a job that is completed.');
  });
});

describe('history is bounded', () => {
  it('keeps JOB_HISTORY_LIMIT jobs per table, and forgets the oldest with their request ids', async () => {
    current = await createTimedApp({ JOB_HISTORY_LIMIT: '2' });
    const api = await client(current);
    const tableId = await api.createTable();
    const ids: string[] = [];
    const requestIds: string[] = [];

    for (let n = 0; n < 3; n += 1) {
      const clientRequestId = randomUUID();
      requestIds.push(clientRequestId);
      const job = api.job((await api.start(tableId, 'star', clientRequestId).expect(201)).body);
      ids.push(job.id);
      await api.command(job.id, 'stop').expect(200);
    }

    expect(
      ((await api.history(tableId).expect(200)).body as { jobs: { id: string }[] }).jobs.map(
        (j) => j.id,
      ),
    ).toStrictEqual([ids[2], ids[1]]);
    await api.getJob(ids[0]!).expect(404);
    // Its request id is forgotten with it: the same id now makes a new job.
    const again = await api.start(tableId, 'star', requestIds[0]).expect(201);
    expect(api.job(again.body).id).not.toBe(ids[0]);
  });
});

describe('a restart', () => {
  it('forgets running jobs: the old job id is JOB_NOT_FOUND, and the table is free', async () => {
    const tables = new InMemoryTableRepository(fixtureTables());
    const first = await createTimedApp({}, { repository: tables });
    const firstApi = await client(first);
    await firstApi.claim('table-001');
    const clientRequestId = randomUUID();
    const job = firstApi.job(
      (await firstApi.start('table-001', 'star', clientRequestId).expect(201)).body,
    );
    await first.app.close();

    // A new instance of the application: the tables persisted, the jobs did not.
    current = await createTimedApp({}, { repository: tables });
    const api = await client(current);
    await api.claim('table-001');

    expect(api.errorOf((await api.getJob(job.id).expect(404)).body).code).toBe('JOB_NOT_FOUND');
    expect(api.errorOf((await api.command(job.id, 'stop').expect(404)).body).code).toBe(
      'JOB_NOT_FOUND',
    );
    expect((await api.getTable('table-001').expect(200)).body).toMatchObject({
      connection: 'online',
      activeJobId: null,
    });
    expect((await api.history('table-001').expect(200)).body).toStrictEqual({ jobs: [] });
    // The old request id is a new request now.
    const fresh = await api.start('table-001', 'star', clientRequestId).expect(201);
    expect(api.job(fresh.body).id).not.toBe(job.id);
  });
});
