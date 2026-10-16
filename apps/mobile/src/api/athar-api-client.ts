/**
 * Typed access to the ATHAR API.
 *
 * This is the only module that knows API *routes*. It maps them onto the
 * shared contracts so that the rest of the app works with validated domain
 * types instead of raw JSON.
 */

import {
  API_V1_PREFIX,
  getDesignResponseSchema,
  getJobResponseSchema,
  getTableResponseSchema,
  healthResponseSchema,
  jobCommandResponseSchema,
  listAmbiencesResponseSchema,
  listDesignsResponseSchema,
  listJobsResponseSchema,
  readyResponseSchema,
  setAmbienceRequestSchema,
  startJobRequestSchema,
  startJobResponseSchema,
  type DesignDetail,
  type DrawingJob,
  type HealthResponse,
  type ListAmbiencesResponse,
  type ListDesignsResponse,
  type ListJobsResponse,
  type ReadyResponse,
  type StartJobRequestInput,
  type Table,
} from '@athar/contracts';
import type { AppEnvironment } from '../config/env';
import { ApiError, HttpClient, type FetchLike } from './http-client';

/** Operational probe routes, addressed outside the versioned API prefix. */
export const HEALTH_PATH = '/health';
export const READY_PATH = '/ready';

/** Options accepted when constructing the client. */
export interface AtharApiClientOptions {
  readonly fetchImpl?: FetchLike;
  /** Source of the `x-request-id` sent with every call. Defaults to a random UUID. */
  readonly generateRequestId?: () => string;
}

/** One path segment, safe to splice into a route whatever the id contains. */
function segment(value: string): string {
  return encodeURIComponent(value);
}

/** The three commands a running job accepts. */
type JobCommand = 'pause' | 'resume' | 'stop';

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
      ...(options.generateRequestId ? { generateRequestId: options.generateRequestId } : {}),
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

  /** The public view of a table. A disabled table is returned, with `enabled: false`. */
  getTable(tableId: string, signal?: AbortSignal): Promise<Table> {
    return this.http.get(
      `${API_V1_PREFIX}/tables/${segment(tableId)}`,
      getTableResponseSchema,
      signal ? { signal } : {},
    );
  }

  /** The design collection, without previews. */
  listDesigns(signal?: AbortSignal): Promise<ListDesignsResponse> {
    return this.http.get(
      `${API_V1_PREFIX}/designs`,
      listDesignsResponseSchema,
      signal ? { signal } : {},
    );
  }

  /** One design, including the preview path. */
  getDesign(designId: string, signal?: AbortSignal): Promise<DesignDetail> {
    return this.http.get(
      `${API_V1_PREFIX}/designs/${segment(designId)}`,
      getDesignResponseSchema,
      signal ? { signal } : {},
    );
  }

  /**
   * Ask a table to draw: a catalogue design (`kind` may be left out), a
   * freehand `path`, or the `rake`.
   *
   * `clientRequestId` makes the call idempotent: reuse the same id when retrying
   * the same start, and create a new one for a deliberate second drawing. A
   * repeat returns the original job rather than starting another.
   */
  startJob(
    tableId: string,
    request: StartJobRequestInput,
    signal?: AbortSignal,
  ): Promise<DrawingJob> {
    return this.http.post(
      `${API_V1_PREFIX}/tables/${segment(tableId)}/jobs`,
      startJobRequestSchema.parse(request),
      startJobResponseSchema,
      signal ? { signal } : {},
    );
  }

  /** The LED ambiences a table with `ledAmbiences` can show. */
  listAmbiences(signal?: AbortSignal): Promise<ListAmbiencesResponse> {
    return this.http.get(
      `${API_V1_PREFIX}/ambiences`,
      listAmbiencesResponseSchema,
      signal ? { signal } : {},
    );
  }

  /** Show an LED ambience on the table. Returns the updated table. */
  setAmbience(tableId: string, ambienceId: string, signal?: AbortSignal): Promise<Table> {
    return this.http.put(
      `${API_V1_PREFIX}/tables/${segment(tableId)}/ambience`,
      setAmbienceRequestSchema.parse({ ambienceId }),
      getTableResponseSchema,
      signal ? { signal } : {},
    );
  }

  /** The job as the API last learnt it. Reads have no side effects. */
  getJob(jobId: string, signal?: AbortSignal): Promise<DrawingJob> {
    return this.http.get(
      `${API_V1_PREFIX}/jobs/${segment(jobId)}`,
      getJobResponseSchema,
      signal ? { signal } : {},
    );
  }

  pauseJob(jobId: string, signal?: AbortSignal): Promise<DrawingJob> {
    return this.commandJob(jobId, 'pause', signal);
  }

  resumeJob(jobId: string, signal?: AbortSignal): Promise<DrawingJob> {
    return this.commandJob(jobId, 'resume', signal);
  }

  /** Abort a job. Whatever has been drawn stays drawn. */
  stopJob(jobId: string, signal?: AbortSignal): Promise<DrawingJob> {
    return this.commandJob(jobId, 'stop', signal);
  }

  /** Recent jobs of a table, newest first. */
  listJobs(tableId: string, limit?: number, signal?: AbortSignal): Promise<ListJobsResponse> {
    return this.http.get(
      `${API_V1_PREFIX}/tables/${segment(tableId)}/jobs`,
      listJobsResponseSchema,
      {
        query: { limit },
        ...(signal ? { signal } : {}),
      },
    );
  }

  private commandJob(
    jobId: string,
    command: JobCommand,
    signal?: AbortSignal,
  ): Promise<DrawingJob> {
    return this.http.post(
      `${API_V1_PREFIX}/jobs/${segment(jobId)}/${command}`,
      {},
      jobCommandResponseSchema,
      signal ? { signal } : {},
    );
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

/** Outcome of a readiness probe. */
export type ReadinessProbeResult =
  | { readonly state: 'ready'; readonly readiness: ReadyResponse }
  /** The API answered, but says it is not ready (HTTP 503). */
  | { readonly state: 'not-ready' }
  | { readonly state: 'unreachable'; readonly reason: string };

/**
 * Ask the API whether it is ready to serve. Like {@link probeBackend}, it never
 * throws: a refusal or an unreachable API is an answer, not a crash.
 */
export async function probeReadiness(client: AtharApiClient): Promise<ReadinessProbeResult> {
  try {
    return { state: 'ready', readiness: await client.getReadiness() };
  } catch (error) {
    if (error instanceof ApiError && error.kind === 'http' && error.status === 503) {
      return { state: 'not-ready' };
    }

    return {
      state: 'unreachable',
      reason: error instanceof Error ? error.message : 'The API could not be reached.',
    };
  }
}
