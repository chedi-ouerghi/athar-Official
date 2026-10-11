import { describe, expect, it, vi } from 'vitest';
import { AtharApiClient, HEALTH_PATH, READY_PATH, probeBackend } from './athar-api-client';
import type { FetchLike } from './http-client';
import type { AppEnvironment } from '../config/env';

const environment: AppEnvironment = {
  apiBaseUrl: 'http://10.0.2.2:3000',
  apiBaseUrlSource: 'platform-default',
  apiTimeoutMs: 1_000,
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
  checks: [{ name: 'configuration', status: 'ok' }],
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
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
