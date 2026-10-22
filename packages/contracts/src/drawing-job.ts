/**
 * Drawing job contracts: the job model, its state machine as data, and the
 * request/response shapes of every v1 job endpoint.
 *
 * The state machine lives here as plain data so the API (which enforces it) and
 * the mobile app (which decides which buttons to show) read one definition.
 * The API remains the only authority: the app never assumes a command will be
 * accepted.
 */

import { z } from 'zod';
import { driverErrorCodeSchema, tableModeSchema } from './device.js';
import { designIdSchema } from './design.js';
import { tableIdSchema } from './table.js';

// ---------------------------------------------------------------------------
// Job model
// ---------------------------------------------------------------------------

export const jobStateSchema = z.enum([
  'queued',
  'drawing',
  'paused',
  'completed',
  'failed',
  'cancelled',
]);
export type JobState = z.infer<typeof jobStateSchema>;

/** Failure reason of a job. Not an HTTP error code; see `errors.ts`. */
export const jobErrorCodeSchema = driverErrorCodeSchema;
export type JobErrorCode = z.infer<typeof jobErrorCodeSchema>;

/**
 * What a job draws: a catalogue design, the owner's own freehand path, or the
 * rake (a spiral that smooths the sand). Each needs its own plan feature.
 */
export const jobKindSchema = z.enum(['design', 'path', 'rake']);
export type JobKind = z.infer<typeof jobKindSchema>;

/**
 * A drawing job. Contains no personal data: no user, device, address or
 * free-text field.
 */
export const drawingJobSchema = z.object({
  id: z.uuid(),
  tableId: tableIdSchema,
  kind: jobKindSchema,
  /** The catalogue design drawn, or `null` for a `path` or `rake` job. */
  designId: designIdSchema.nullable(),
  /** Copied from the driver at creation and immutable, so history is never relabelled. */
  mode: tableModeSchema,
  state: jobStateSchema,
  /** Never decreases; 1 if and only if the job is `completed`. */
  progress: z.number().min(0).max(1),
  createdAt: z.string(),
  /** First entry into `drawing`. */
  startedAt: z.string().nullable(),
  updatedAt: z.string(),
  /** Entry into a terminal state. */
  finishedAt: z.string().nullable(),
  /** Set if and only if the job is `failed`. */
  errorCode: jobErrorCodeSchema.nullable(),
});
export type DrawingJob = z.infer<typeof drawingJobSchema>;

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------

/** State of every newly accepted job. */
export const JOB_INITIAL_STATE = 'queued' as const satisfies JobState;

/** Active states hold their table: at most one job per table may be active. */
export const JOB_ACTIVE_STATES = [
  'queued',
  'drawing',
  'paused',
] as const satisfies readonly JobState[];

/** Terminal states never change again. */
export const JOB_TERMINAL_STATES = [
  'completed',
  'failed',
  'cancelled',
] as const satisfies readonly JobState[];

/** What causes a transition. Commands come from clients, driver events from the table. */
export const jobTriggerSchema = z.enum([
  'pause',
  'resume',
  'stop',
  'driver-accepted',
  'driver-rejected',
  'driver-completed',
  'driver-fault',
]);
export type JobTrigger = z.infer<typeof jobTriggerSchema>;

export interface JobTransition {
  readonly from: JobState;
  readonly to: JobState;
  readonly trigger: JobTrigger;
}

/**
 * Every allowed transition after creation. Anything not listed is rejected
 * with `INVALID_TRANSITION`. Creation itself (nothing to `queued`) is not a
 * transition: see {@link JOB_INITIAL_STATE}.
 */
export const JOB_TRANSITIONS: readonly JobTransition[] = [
  { from: 'queued', to: 'drawing', trigger: 'driver-accepted' },
  { from: 'queued', to: 'failed', trigger: 'driver-rejected' },
  { from: 'queued', to: 'cancelled', trigger: 'stop' },
  { from: 'drawing', to: 'paused', trigger: 'pause' },
  { from: 'paused', to: 'drawing', trigger: 'resume' },
  { from: 'drawing', to: 'completed', trigger: 'driver-completed' },
  { from: 'drawing', to: 'failed', trigger: 'driver-fault' },
  { from: 'paused', to: 'failed', trigger: 'driver-fault' },
  { from: 'drawing', to: 'cancelled', trigger: 'stop' },
  { from: 'paused', to: 'cancelled', trigger: 'stop' },
];

export function isActiveJobState(state: JobState): boolean {
  return (JOB_ACTIVE_STATES as readonly JobState[]).includes(state);
}

export function isTerminalJobState(state: JobState): boolean {
  return (JOB_TERMINAL_STATES as readonly JobState[]).includes(state);
}

/** State reached by applying `trigger` in `from`, or `undefined` when not allowed. */
export function nextJobState(from: JobState, trigger: JobTrigger): JobState | undefined {
  return JOB_TRANSITIONS.find((t) => t.from === from && t.trigger === trigger)?.to;
}

// ---------------------------------------------------------------------------
// Endpoints
// ---------------------------------------------------------------------------

/** Path parameters of every `/api/v1/jobs/:jobId` endpoint. */
export const jobParamsSchema = z.object({ jobId: z.uuid() });
export type JobParams = z.infer<typeof jobParamsSchema>;

/**
 * Most points a freehand `path` may have. A finger stroke is simplified by the
 * app before sending; the API densifies it again, so 1000 is plenty and keeps
 * the body small (about 40 kB as JSON).
 */
export const DRAWING_PATH_MAX_POINTS = 1000;

/**
 * A freehand path in the `polar-theta-rho/v1` convention (see `polar-path.ts`):
 * `[theta, rho]` with theta in radians and rho 0 (centre) to 1 (edge). Points
 * may be far apart: the API joins them with straight lines, adds a lead-in from
 * home and a return to home, and validates the result like a design trajectory.
 */
export const drawingPathSchema = z
  .array(z.tuple([z.number(), z.number().min(0).max(1)]))
  .min(2)
  .max(DRAWING_PATH_MAX_POINTS);
export type DrawingPath = z.infer<typeof drawingPathSchema>;

/**
 * Client-generated UUID that makes a start idempotent: a repeat with the same
 * id and the same request returns the original job instead of creating another.
 */
const clientRequestIdSchema = z.uuid();

/**
 * Body of `POST /api/v1/tables/:tableId/jobs`, by `kind`. `kind` defaults to
 * `design`, so a body without it (every v1 client before Phase 5) still parses.
 */
export const startJobRequestSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('design').default('design'),
    designId: designIdSchema,
    clientRequestId: clientRequestIdSchema,
  }),
  z.object({
    kind: z.literal('path'),
    path: drawingPathSchema,
    clientRequestId: clientRequestIdSchema,
  }),
  z.object({ kind: z.literal('rake'), clientRequestId: clientRequestIdSchema }),
]);
/** The parsed body: `kind` is always present. */
export type StartJobRequest = z.infer<typeof startJobRequestSchema>;
/** What a client may send: `kind` may be left out for a design. */
export type StartJobRequestInput = z.input<typeof startJobRequestSchema>;

/**
 * Payload of `POST /api/v1/tables/:tableId/jobs`: `201` for a new job, `200`
 * for an idempotent replay.
 */
export const startJobResponseSchema = drawingJobSchema;
export type StartJobResponse = DrawingJob;

/** Payload of `GET /api/v1/jobs/:jobId`. */
export const getJobResponseSchema = drawingJobSchema;
export type GetJobResponse = DrawingJob;

/** Body of `POST /api/v1/jobs/:jobId/pause|resume|stop`. Must be empty. */
export const jobCommandRequestSchema = z.object({});
export type JobCommandRequest = z.infer<typeof jobCommandRequestSchema>;

/** Payload of the pause, resume and stop endpoints: the updated job. */
export const jobCommandResponseSchema = drawingJobSchema;
export type JobCommandResponse = DrawingJob;

/** Default and hard upper bound of the history `limit` query parameter. */
export const JOB_HISTORY_DEFAULT_LIMIT = 10;
export const JOB_HISTORY_MAX_LIMIT = 100;

/**
 * Query of `GET /api/v1/tables/:tableId/jobs`. The server may retain fewer
 * jobs than the maximum (`JOB_HISTORY_LIMIT`); it then returns what it has.
 */
export const listJobsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(JOB_HISTORY_MAX_LIMIT)
    .default(JOB_HISTORY_DEFAULT_LIMIT),
});
export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;

/** Payload of `GET /api/v1/tables/:tableId/jobs`, newest first. */
export const listJobsResponseSchema = z.object({
  jobs: z.array(drawingJobSchema),
});
export type ListJobsResponse = z.infer<typeof listJobsResponseSchema>;
