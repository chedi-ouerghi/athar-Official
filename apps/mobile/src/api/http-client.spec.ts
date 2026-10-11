import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ApiError, HttpClient, type FetchLike } from './http-client';

const payloadSchema = z.object({ status: z.string(), count: z.number() });

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(body === undefined ? '' : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}

function client(fetchImpl: FetchLike, timeoutMs = 1_000): HttpClient {
  return new HttpClient({ baseUrl: 'http://api.test:3000', timeoutMs, fetchImpl });
}

/** A `fetch` that never settles until its signal aborts. */
function hangingFetch(): FetchLike {
  return (_input, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        const error = new Error('Aborted');
        error.name = 'AbortError';
        reject(error);
      });
    });
}

describe('HttpClient', () => {
  it('returns the parsed payload on success', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(jsonResponse({ status: 'ok', count: 3 }));

    const result = await client(fetchImpl).get('/health', payloadSchema);

    expect(result).toStrictEqual({ status: 'ok', count: 3 });
  });

  it('builds the URL from configuration, not from a hardcoded host', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(jsonResponse({ status: 'ok', count: 0 }));

    await client(fetchImpl).get('/ready', payloadSchema);

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://api.test:3000/ready',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('serialises query parameters and drops undefined values', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(jsonResponse({ status: 'ok', count: 0 }));

    await client(fetchImpl).get('/health', payloadSchema, {
      query: { verbose: true, limit: 10, cursor: undefined },
    });

    expect(fetchImpl.mock.calls[0]?.[0]).toBe('http://api.test:3000/health?verbose=true&limit=10');
  });

  it('rejects with kind "timeout" when the server does not answer in time', async () => {
    const http = client(hangingFetch(), 10);

    const error = await http.get('/health', payloadSchema).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('timeout');
  });

  it('rejects with kind "network" when the host cannot be reached', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockRejectedValue(new TypeError('fetch failed'));

    const error = await client(fetchImpl)
      .get('/health', payloadSchema)
      .catch((e: unknown) => e);

    expect((error as ApiError).kind).toBe('network');
  });

  it('rejects with kind "cancelled" when the caller aborts', async () => {
    const controller = new AbortController();
    const http = client(hangingFetch(), 5_000);

    const pending = http.get('/health', payloadSchema, { signal: controller.signal });
    controller.abort();

    const error = await pending.catch((e: unknown) => e);

    expect((error as ApiError).kind).toBe('cancelled');
  });

  it('surfaces the server error envelope for a non-2xx response', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 'NOT_FOUND',
            message: 'Cannot GET /missing',
            requestId: 'req-1',
            timestamp: '2026-01-01T00:00:00.000Z',
          },
        },
        { status: 404 },
      ),
    );

    const error = await client(fetchImpl)
      .get('/missing', payloadSchema)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('http');
    expect((error as ApiError).status).toBe(404);
    expect((error as ApiError).code).toBe('NOT_FOUND');
    expect((error as ApiError).requestId).toBe('req-1');
  });

  it('still produces a useful error when the error body is not JSON', async () => {
    const fetchImpl = vi
      .fn<FetchLike>()
      .mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 }));

    const error = await client(fetchImpl)
      .get('/health', payloadSchema)
      .catch((e: unknown) => e);

    expect((error as ApiError).kind).toBe('http');
    expect((error as ApiError).status).toBe(502);
    expect((error as ApiError).message).toContain('502');
  });

  it('rejects with kind "invalid-response" when the body breaks the contract', async () => {
    const fetchImpl = vi.fn<FetchLike>().mockResolvedValue(jsonResponse({ count: 'three' }));

    const error = await client(fetchImpl)
      .get('/health', payloadSchema)
      .catch((e: unknown) => e);

    expect((error as ApiError).kind).toBe('invalid-response');
  });

  it('reports the configured origin', () => {
    expect(client(vi.fn<FetchLike>()).origin).toBe('http://api.test:3000');
  });
});
