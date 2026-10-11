/**
 * Minimal, dependency-free HTTP transport for talking to the ATHAR API.
 *
 * Responsibilities kept here (and nowhere else):
 *
 * - building URLs from configuration rather than from hardcoded strings;
 * - enforcing a request timeout;
 * - classifying failures into a small, predictable set of kinds;
 * - validating response payloads against a schema before they reach the UI.
 *
 * It knows nothing about React, navigation or screens.
 */

import { apiErrorResponseSchema, type ApiErrorCode } from '@athar/contracts';
import type { z } from 'zod';
import { joinUrl } from '../config/env';
import { createUuid } from './request-id';

/** Header that correlates a client-side failure with a server log entry. */
export const REQUEST_ID_HEADER = 'x-request-id';

/** Why a request did not produce a usable response. */
export type ApiErrorKind =
  /** The request exceeded the configured timeout. */
  | 'timeout'
  /** The caller's `AbortSignal` was triggered. */
  | 'cancelled'
  /** The request never reached the server (host unreachable, DNS, TLS, ...). */
  | 'network'
  /** The server answered with a non-2xx status. */
  | 'http'
  /** The server answered with 2xx but the body did not match the contract. */
  | 'invalid-response';

/**
 * Error raised by {@link HttpClient}.
 *
 * Callers branch on {@link kind} rather than parsing the message, and never
 * need to inspect a raw `Response` or a `TypeError` from `fetch`.
 */
export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status?: number,
    readonly code?: ApiErrorCode,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Signature of the platform `fetch`, injectable for testing. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpClientOptions {
  /** API origin, e.g. `http://10.0.2.2:3000`. */
  readonly baseUrl: string;
  /** Per-request timeout in milliseconds. */
  readonly timeoutMs: number;
  /** Override for the `fetch` implementation. Defaults to the global one. */
  readonly fetchImpl?: FetchLike;
  /** Source of the per-request correlation id. Defaults to a random UUID. */
  readonly generateRequestId?: () => string;
}

export interface RequestOptions {
  /** Caller-owned cancellation signal. */
  readonly signal?: AbortSignal;
  /** Additional query parameters. */
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
}

/** Marker used to tell a timeout apart from caller-initiated cancellation. */
const TIMEOUT_REASON = Symbol('athar.request-timeout');

/**
 * Combine the timeout with an optional caller signal.
 *
 * `AbortSignal.any` is not used: it is not available on every React Native
 * engine version this app may run on.
 */
function createRequestSignal(
  timeoutMs: number,
  external: AbortSignal | undefined,
): { signal: AbortSignal; timedOut: () => boolean; cleanup: () => void } {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(TIMEOUT_REASON);
  }, timeoutMs);

  const forwardExternalAbort = () => {
    controller.abort(external?.reason);
  };

  if (external) {
    if (external.aborted) {
      controller.abort(external.reason);
    } else {
      external.addEventListener('abort', forwardExternalAbort);
    }
  }

  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      external?.removeEventListener('abort', forwardExternalAbort);
    },
  };
}

/** Serialise query parameters, dropping `undefined` values. */
function buildQuery(query: RequestOptions['query']): string {
  if (query === undefined) {
    return '';
  }

  const entries = Object.entries(query).filter(
    (entry): entry is [string, string | number | boolean] => entry[1] !== undefined,
  );

  if (entries.length === 0) {
    return '';
  }

  const search = entries
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');

  return `?${search}`;
}

/**
 * Translate a thrown value from `fetch` into an {@link ApiError}.
 */
function toTransportError(error: unknown, timedOut: boolean, requestId: string): ApiError {
  if (timedOut) {
    return new ApiError('timeout', 'The request timed out.', undefined, undefined, requestId);
  }

  if (error instanceof Error && error.name === 'AbortError') {
    return new ApiError('cancelled', 'The request was cancelled.', undefined, undefined, requestId);
  }

  return new ApiError(
    'network',
    'The API could not be reached. Check that it is running and reachable from this device.',
    undefined,
    undefined,
    requestId,
  );
}

/**
 * Translate a non-2xx response into an {@link ApiError}, reusing the
 * server-provided error envelope when the response carries one.
 */
function toHttpError(status: number, body: unknown, clientRequestId: string): ApiError {
  const parsed = apiErrorResponseSchema.safeParse(body);

  if (parsed.success) {
    const { code, message, requestId } = parsed.data.error;
    return new ApiError('http', message, status, code, requestId);
  }

  return new ApiError(
    'http',
    `The API responded with status ${status}.`,
    status,
    undefined,
    clientRequestId,
  );
}

/** HTTP client bound to a single API origin. */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: FetchLike;
  private readonly generateRequestId: () => string;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl;
    this.timeoutMs = options.timeoutMs;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.generateRequestId = options.generateRequestId ?? createUuid;
  }

  /** The API origin this client targets. */
  get origin(): string {
    return this.baseUrl;
  }

  /**
   * Perform a GET request and validate the body against `schema`.
   *
   * @throws ApiError for every failure mode, including a contract violation.
   */
  get<TSchema extends z.ZodType>(
    path: string,
    schema: TSchema,
    options: RequestOptions = {},
  ): Promise<z.output<TSchema>> {
    return this.send('GET', path, schema, options);
  }

  /**
   * Perform a POST request with a JSON body (or none, for commands that take no
   * payload) and validate the response against `schema`.
   *
   * @throws ApiError for every failure mode, including a contract violation.
   */
  post<TSchema extends z.ZodType>(
    path: string,
    body: unknown,
    schema: TSchema,
    options: RequestOptions = {},
  ): Promise<z.output<TSchema>> {
    return this.send('POST', path, schema, options, body);
  }

  private async send<TSchema extends z.ZodType>(
    method: 'GET' | 'POST',
    path: string,
    schema: TSchema,
    options: RequestOptions,
    body?: unknown,
  ): Promise<z.output<TSchema>> {
    const url = `${joinUrl(this.baseUrl, path)}${buildQuery(options.query)}`;
    const requestId = this.generateRequestId();
    const request = createRequestSignal(this.timeoutMs, options.signal);

    const headers: Record<string, string> = {
      Accept: 'application/json',
      [REQUEST_ID_HEADER]: requestId,
    };

    if (method === 'POST') {
      headers['Content-Type'] = 'application/json';
    }

    try {
      const response = await this.fetchImpl(url, {
        method,
        headers,
        // A command with no payload still sends `{}`: the API validates an empty
        // object, and a body-less POST with a JSON content type is rejected by
        // some parsers.
        ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
        signal: request.signal,
      });

      const responseBody = await readJsonBody(response);

      if (!response.ok) {
        throw toHttpError(response.status, responseBody, requestId);
      }

      const parsed = schema.safeParse(responseBody);

      if (!parsed.success) {
        throw new ApiError(
          'invalid-response',
          'The API returned a response that does not match the expected contract.',
          response.status,
          undefined,
          requestId,
        );
      }

      return parsed.data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }

      throw toTransportError(error, request.timedOut(), requestId);
    } finally {
      request.cleanup();
    }
  }
}

/**
 * Read a response body as JSON, tolerating an empty body.
 *
 * Returns `undefined` rather than throwing so that an HTML error page from an
 * intermediary still produces a useful `ApiError` instead of a parse failure.
 */
async function readJsonBody(response: Response): Promise<unknown> {
  const raw = await response.text();

  if (raw.length === 0) {
    return undefined;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}
