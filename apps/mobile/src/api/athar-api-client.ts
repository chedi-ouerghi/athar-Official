/**
 * Typed access to the ATHAR API.
 *
 * This is the only module that knows API *routes*. It maps them onto the
 * shared contracts so that the rest of the app works with validated domain
 * types instead of raw JSON.
 */

import {
  healthResponseSchema,
  readyResponseSchema,
  type HealthResponse,
  type ReadyResponse,
} from '@athar/contracts';
import type { AppEnvironment } from '../config/env';
import { HttpClient, type FetchLike } from './http-client';

/** Operational probe routes, addressed outside the versioned API prefix. */
export const HEALTH_PATH = '/health';
export const READY_PATH = '/ready';

/** Options accepted when constructing the client. */
export interface AtharApiClientOptions {
  readonly fetchImpl?: FetchLike;
}

/**
 * Client for the operational endpoints.
 *
 * Constructed once with the resolved application configuration; pass a
 * `fetchImpl` to exercise it against a stub in tests.
 */
export class AtharApiClient {
  private readonly http: HttpClient;

  constructor(environment: AppEnvironment, options: AtharApiClientOptions = {}) {
    this.http = new HttpClient({
      baseUrl: environment.apiBaseUrl,
      timeoutMs: environment.apiTimeoutMs,
      ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
    });
  }

  /** API origin this client talks to. */
  get origin(): string {
    return this.http.origin;
  }

  /** Liveness probe. */
  getHealth(signal?: AbortSignal): Promise<HealthResponse> {
    return this.http.get(HEALTH_PATH, healthResponseSchema, signal ? { signal } : {});
  }

  /** Readiness probe. */
  getReadiness(signal?: AbortSignal): Promise<ReadyResponse> {
    return this.http.get(READY_PATH, readyResponseSchema, signal ? { signal } : {});
  }
}

/** Outcome of a connectivity probe against the API. */
export type BackendProbeResult =
  | { readonly state: 'reachable'; readonly health: HealthResponse }
  | { readonly state: 'unreachable'; readonly reason: string };

/**
 * Check whether the backend answers its liveness probe.
 *
 * This is the single integration point used to prove mobile-to-backend
 * communication works. It never throws: an unreachable backend is an expected
 * state, not an error, and must not prevent the app from starting.
 */
export async function probeBackend(client: AtharApiClient): Promise<BackendProbeResult> {
  try {
    const health = await client.getHealth();
    return { state: 'reachable', health };
  } catch (error) {
    return {
      state: 'unreachable',
      reason: error instanceof Error ? error.message : 'The API could not be reached.',
    };
  }
}
