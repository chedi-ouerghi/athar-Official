import { describe, expect, it, vi } from 'vitest';
import { AtharApiClient, HEALTH_PATH, READY_PATH, probeBackend } from './athar-api-client';
import type { FetchLike } from './http-client';
import type { AppEnvironment } from '../config/env';

const environment: AppEnvironment = {
  apiBaseUrl: 'http://10.0.2.2:3000',
  apiBaseUrlSource: 'platform-default',
  apiTimeoutMs: 1_000,
  tableLinkHosts: [],
  pollIntervalMs: 1_000,
};

const HEALTH_BODY = {
  status: 'ok',
  service: 'athar-api',
  version: '0.1.0',
  timestamp: '2026-01-01T00:00:00.000Z',
  uptimeSeconds: 12,
};

const READY_BODY = {
  status: 'ok',
  service: 'athar-api',
  version: '0.1.0',
  timestamp: '2026-01-01T00:00:00.000Z',
  uptimeSeconds: 12,
  tableMode: 'simulation',
  checks: [{ name: 'configuration', status: 'ok' }],
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('AtharApiClient', () => {
  it('calls the liveness probe on the unversioned path', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(jsonResponse(HEALTH_BODY));

    const health = await new AtharApiClient(environment, { fetchImpl }).getHealth();

    expect(fetchImpl.mock.calls[0]?.[0]).toBe(`http://10.0.2.2:3000${HEALTH_PATH}`);
    expect(health.service).toBe('athar-api');
  });

  it('calls the readiness probe on the unversioned path', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(jsonResponse(READY_BODY));

    const readiness = await new AtharApiClient(environment, { fetchImpl }).getReadiness();

    expect(fetchImpl.mock.calls[0]?.[0]).toBe(`http://10.0.2.2:3000${READY_PATH}`);
    expect(readiness.checks).toHaveLength(1);
  });

  it('exposes the origin it was configured with', () => {
    expect(new AtharApiClient(environment).origin).toBe('http://10.0.2.2:3000');
  });
});

const TABLE_ID = 'k7q3x9m2d8r5t6w4';
const JOB_ID = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b';
const NOW = '2026-01-01T00:00:00.000Z';

const TABLE = {
  id: TABLE_ID,
  displayName: 'Main hall',
  location: 'Ground floor',
  enabled: true,
  mode: 'simulation',
  connection: 'online',
  activeJobId: null,
  plan: 'basic',
  voiceAssistant: false,
  geometry: { shape: 'oval', widthMm: 1000, heightMm: 600 },
  features: ['catalogue', 'rake'],
  ambienceId: null,
  readiness: { paired: true, online: true, free: true, canStart: true },
  access: { role: 'owner' },
};

const DESIGN_SUMMARY = {
  id: 'dunes',
  slug: 'dunes',
  title: { en: 'Dunes', ar: 'كثبان' },
  description: { en: 'Wind-shaped ridges.', ar: 'حافات صنعتها الرياح.' },
  inspiration: {
    kind: 'original-modern',
    note: { en: 'An original interpretation.', ar: 'تفسير أصلي.' },
    sources: [],
  },
  estimatedDurationSeconds: 120,
};

const JOB = {
  id: JOB_ID,
  tableId: TABLE_ID,
  kind: 'design',
  designId: 'dunes',
  mode: 'simulation',
  state: 'drawing',
  progress: 0.25,
  createdAt: NOW,
  startedAt: NOW,
  updatedAt: NOW,
  finishedAt: null,
  errorCode: null,
};

function clientWith(body: unknown) {
  const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(jsonResponse(body));
  const client = new AtharApiClient(environment, { fetchImpl });
  const call = () => fetchImpl.mock.calls[0];

  return { client, call, url: () => call()?.[0], init: () => call()?.[1] };
}

describe('AtharApiClient: tables, designs and jobs', () => {
  const base = 'http://10.0.2.2:3000/api/v1';

  it('gets a table', async () => {
    const { client, url, init } = clientWith(TABLE);

    await expect(client.getTable(TABLE_ID)).resolves.toMatchObject({ id: TABLE_ID });
    expect(url()).toBe(`${base}/tables/${TABLE_ID}`);
    expect(init()?.method).toBe('GET');
  });

  it('lists designs', async () => {
    const { client, url } = clientWith({ collectionVersion: 1, designs: [DESIGN_SUMMARY] });

    const result = await client.listDesigns();

    expect(url()).toBe(`${base}/designs`);
    expect(result.designs[0]?.title.ar).toBe('كثبان');
  });

  it('gets a design with its preview path', async () => {
    const { client, url } = clientWith({
      ...DESIGN_SUMMARY,
      previewPath: [
        [0, 0],
        [3, 1],
      ],
    });

    const design = await client.getDesign('dunes');

    expect(url()).toBe(`${base}/designs/dunes`);
    expect(design.previewPath).toHaveLength(2);
  });

  it('starts a job with a POST carrying the design and the idempotency id', async () => {
    const { client, url, init } = clientWith({ ...JOB, state: 'queued', progress: 0 });
    const clientRequestId = '0b8f5f46-3a4d-4c8e-8d3b-6f1d2a9c7e10';

    const job = await client.startJob(TABLE_ID, { designId: 'dunes', clientRequestId });

    expect(url()).toBe(`${base}/tables/${TABLE_ID}/jobs`);
    expect(init()?.method).toBe('POST');
    // The contract fills in the default kind before sending.
    expect(JSON.parse(String(init()?.body))).toStrictEqual({
      kind: 'design',
      designId: 'dunes',
      clientRequestId,
    });
    expect(job.state).toBe('queued');
  });

  it('starts a freehand path or the rake', async () => {
    const clientRequestId = '0b8f5f46-3a4d-4c8e-8d3b-6f1d2a9c7e10';
    const path = [
      [0, 0.2],
      [1, 0.5],
    ] as [number, number][];

    const pen = clientWith({ ...JOB, kind: 'path', designId: null });
    await pen.client.startJob(TABLE_ID, { kind: 'path', path, clientRequestId });
    expect(JSON.parse(String(pen.init()?.body))).toStrictEqual({
      kind: 'path',
      path,
      clientRequestId,
    });

    const rake = clientWith({ ...JOB, kind: 'rake', designId: null });
    const job = await rake.client.startJob(TABLE_ID, { kind: 'rake', clientRequestId });
    expect(job.designId).toBeNull();
  });

  it('lists the ambiences', async () => {
    const amber = { id: 'amber', name: { en: 'Amber', ar: 'كهرماني' }, color: '#ffbf00' };
    const { client, url } = clientWith({ ambiences: [amber] });

    await expect(client.listAmbiences()).resolves.toStrictEqual({ ambiences: [amber] });
    expect(url()).toBe(`${base}/ambiences`);
  });

  it('sets the ambience with a PUT and returns the table', async () => {
    const { client, url, init } = clientWith({ ...TABLE, ambienceId: 'amber' });

    const table = await client.setAmbience(TABLE_ID, 'amber');

    expect(url()).toBe(`${base}/tables/${TABLE_ID}/ambience`);
    expect(init()?.method).toBe('PUT');
    expect(JSON.parse(String(init()?.body))).toStrictEqual({ ambienceId: 'amber' });
    expect(table.ambienceId).toBe('amber');
  });

  it('refuses to send a start request that breaks the contract', () => {
    const { client, call } = clientWith(JOB);

    expect(() =>
      client.startJob(TABLE_ID, { designId: 'dunes', clientRequestId: 'not-a-uuid' }),
    ).toThrow();
    expect(call()).toBeUndefined();
  });

  it('gets a job', async () => {
    const { client, url } = clientWith(JOB);

    await expect(client.getJob(JOB_ID)).resolves.toMatchObject({ progress: 0.25 });
    expect(url()).toBe(`${base}/jobs/${JOB_ID}`);
  });

  it.each([
    ['pauseJob', 'pause'],
    ['resumeJob', 'resume'],
    ['stopJob', 'stop'],
  ] as const)('%s POSTs an empty body to /%s', async (method, command) => {
    const { client, url, init } = clientWith(JOB);

    await client[method](JOB_ID);

    expect(url()).toBe(`${base}/jobs/${JOB_ID}/${command}`);
    expect(init()?.method).toBe('POST');
    expect(init()?.body).toBe('{}');
  });

  it('lists jobs, with an optional limit', async () => {
    const withLimit = clientWith({ jobs: [JOB] });
    await withLimit.client.listJobs(TABLE_ID, 5);
    expect(withLimit.url()).toBe(`${base}/tables/${TABLE_ID}/jobs?limit=5`);

    const without = clientWith({ jobs: [] });
    await without.client.listJobs(TABLE_ID);
    expect(without.url()).toBe(`${base}/tables/${TABLE_ID}/jobs`);
  });

  it('encodes ids so they cannot change the route', async () => {
    const { client, url } = clientWith(JOB);

    await client.getJob('../health?x=1');

    expect(url()).toBe(`${base}/jobs/..%2Fhealth%3Fx%3D1`);
  });

  it('rejects a response that breaks the contract', async () => {
    const { client } = clientWith({ ...JOB, progress: 7 });

    await expect(client.getJob(JOB_ID)).rejects.toMatchObject({ kind: 'invalid-response' });
  });

  it('sends the same correlation header on every call', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockImplementation(() => Promise.resolve(jsonResponse(TABLE)));
    const client = new AtharApiClient(environment, { fetchImpl, generateRequestId: () => 'rid-1' });

    await client.getTable(TABLE_ID);

    expect((fetchImpl.mock.calls[0]?.[1]?.headers as Record<string, string>)['x-request-id']).toBe(
      'rid-1',
    );
  });
});

describe('probeBackend', () => {
  it('reports the service as reachable when the health endpoint answers', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(jsonResponse(HEALTH_BODY));

    const result = await probeBackend(new AtharApiClient(environment, { fetchImpl }));

    expect(result.state).toBe('reachable');
  });

  it('reports the service as unreachable without throwing when it is offline', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockRejectedValue(new TypeError('fetch failed'));

    const result = await probeBackend(new AtharApiClient(environment, { fetchImpl }));

    expect(result).toStrictEqual({
      state: 'unreachable',
      reason: expect.any(String),
    });
  });

  it('reports the service as unreachable when the response breaks the contract', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(jsonResponse({ status: 'maybe' }));

    const result = await probeBackend(new AtharApiClient(environment, { fetchImpl }));

    expect(result.state).toBe('unreachable');
  });
});

describe('AtharApiClient: pairing, sharing and light', () => {
  const base = 'http://10.0.2.2:3000/api/v1';
  const TOKEN = 'A'.repeat(43);

  it('pairs a table with a QR token', async () => {
    const { client, url, init } = clientWith({ tableId: TABLE_ID, role: 'owner', expiresAt: null });

    await expect(client.pairTable({ tableId: TABLE_ID, token: TOKEN })).resolves.toMatchObject({
      role: 'owner',
    });
    expect(url()).toBe(`${base}/tables/pair`);
    expect(init()?.body).toBe(JSON.stringify({ tableId: TABLE_ID, token: TOKEN }));
  });

  it('creates a share with the contract defaults', async () => {
    const { client, url, init } = clientWith({
      link: 'https://app.athar.example/pair?tableId=x&token=y',
      deepLink: 'athar://pair?tableId=x&token=y',
      expiresAt: NOW,
      shareId: JOB_ID,
      maxUses: 1,
    });

    await client.createShare(TABLE_ID);

    expect(url()).toBe(`${base}/tables/${TABLE_ID}/shares`);
    expect(init()?.body).toBe(JSON.stringify({ expiresInHours: 24, maxUses: 1 }));
  });

  it('sets a colour, normalising it and filling the brightness', async () => {
    const { client, url, init } = clientWith(TABLE);

    await client.setLight(TABLE_ID, { mode: 'color', color: '#FF8800' });

    expect(url()).toBe(`${base}/tables/${TABLE_ID}/light`);
    expect(init()?.method).toBe('PUT');
    expect(init()?.body).toBe(JSON.stringify({ mode: 'color', color: '#ff8800', brightness: 100 }));
  });

  it('refuses a malformed colour before sending anything', async () => {
    const { client, call } = clientWith(TABLE);

    await expect(client.setLight(TABLE_ID, { mode: 'color', color: 'red' })).rejects.toThrow();
    expect(call()).toBeUndefined();
  });

  it('reopens a lapsed pairing once and retries the light', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValueOnce(
        jsonResponse(
          { error: { code: 'PAIRING_REQUIRED', message: 'x', requestId: 'r', timestamp: NOW } },
          409,
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ tableId: TABLE_ID, expiresAt: NOW }))
      .mockResolvedValueOnce(jsonResponse(TABLE));
    const client = new AtharApiClient(environment, { fetchImpl });

    await client.setLight(TABLE_ID, { mode: 'on' });

    expect(fetchImpl.mock.calls.map(([url]) => url.replace(base, ''))).toStrictEqual([
      `/tables/${TABLE_ID}/light`,
      `/tables/${TABLE_ID}/pairing`,
      `/tables/${TABLE_ID}/light`,
    ]);
  });

  it('sends the bearer token, except on sign-in', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(jsonResponse(TABLE));
    const client = new AtharApiClient(environment, {
      fetchImpl,
      accessToken: () => Promise.resolve('tok'),
    });

    await client.getTable(TABLE_ID);
    await client.login({ email: 'a@athar.test', password: 'x' }).catch(() => undefined);

    const auth = (call: number) =>
      (fetchImpl.mock.calls[call]?.[1]?.headers as Record<string, string>).Authorization;

    expect(auth(0)).toBe('Bearer tok');
    expect(auth(1)).toBeUndefined();
  });
});
