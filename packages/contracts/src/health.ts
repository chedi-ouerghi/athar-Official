/**
 * Shared health and readiness contracts.
 *
 * These schemas are the single definition of the payloads returned by the
 * unversioned liveness/readiness endpoints. They intentionally expose nothing
 * beyond a status and a duration: no environment values, no dependency
 * details, no infrastructure topology.
 */

import { z } from 'zod';

/** Result reported by a health probe. */
export const healthStatusSchema = z.enum(['ok', 'error']);
export type HealthStatus = z.infer<typeof healthStatusSchema>;

/** Shared fields for both probe endpoints. */
const probeBase = {
  status: healthStatusSchema,
  /** ISO-8601 timestamp (UTC) of when the probe was evaluated. */
  timestamp: z.string(),
  /** Process uptime in whole seconds, rounded down. */
  uptimeSeconds: z.number().int().nonnegative(),
  /** Version of the running service, sourced from package.json. */
  version: z.string(),
};

/** Payload of `GET /health`. */
export const healthResponseSchema = z.object({
  ...probeBase,
  service: z.string(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

/** A single readiness probe result. */
export const readinessCheckSchema = z.object({
  name: z.string(),
  status: healthStatusSchema,
});
export type ReadinessCheck = z.infer<typeof readinessCheckSchema>;

/**
 * Payload of `GET /ready`.
 *
 * Each entry reports only the name of the probe and whether it passed. Probe
 * output (connection strings, host names, timings of internal calls) is
 * deliberately excluded from the response body and kept in server logs.
 */
export const readyResponseSchema = z.object({
  ...probeBase,
  service: z.string(),
  checks: z.array(readinessCheckSchema),
});
export type ReadyResponse = z.infer<typeof readyResponseSchema>;
