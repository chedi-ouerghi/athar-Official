/**
 * Device-level vocabulary shared by the API and the mobile client.
 *
 * These types describe what a table reports about itself, independent of any
 * controller, motor protocol or transport. They are the wire-visible half of
 * the API's `TableDriver` boundary; the driver interface itself, and the
 * trajectory it receives, stay inside the API.
 */

import { z } from 'zod';

/**
 * Whether a table, status or job is simulated or physical.
 *
 * Every status and every job carries it, so a simulated drawing can never be
 * presented as a real one.
 */
export const tableModeSchema = z.enum(['simulation', 'hardware']);
export type TableMode = z.infer<typeof tableModeSchema>;

/** Reachability of a table from the driver's point of view. */
export const driverConnectionSchema = z.enum(['online', 'offline', 'busy', 'error']);
export type DriverConnection = z.infer<typeof driverConnectionSchema>;

/** What the table is doing right now. */
export const driverPhaseSchema = z.enum([
  'idle',
  'drawing',
  'paused',
  'completed',
  'failed',
  'cancelled',
]);
export type DriverPhase = z.infer<typeof driverPhaseSchema>;

/**
 * Transport-neutral failure reasons a driver can report.
 *
 * `SIMULATED_FAULT` is only ever produced by a simulated driver. These values
 * are also the `errorCode` of a failed drawing job, and are distinct from the
 * HTTP error codes in `errors.ts`.
 */
export const driverErrorCodeSchema = z.enum([
  'OFFLINE',
  'BUSY',
  'TRAJECTORY_REJECTED',
  'FAULT',
  'SIMULATED_FAULT',
]);
export type DriverErrorCode = z.infer<typeof driverErrorCodeSchema>;

/**
 * Snapshot of a table as reported by its driver.
 *
 * `mode` is mandatory: there is no mode-less form of a status.
 */
export const driverStatusSchema = z.object({
  /** Not format-checked here: the driver boundary is internal to the API. */
  tableId: z.string().min(1),
  mode: tableModeSchema,
  connection: driverConnectionSchema,
  phase: driverPhaseSchema,
  /** Job the table is executing or has just finished, if any. */
  jobId: z.string().min(1).nullable(),
  /** Fraction of the trajectory completed. 0 when there is no job. */
  progress: z.number().min(0).max(1),
  errorCode: driverErrorCodeSchema.nullable(),
  /** ISO-8601 UTC time at which the driver observed this state. */
  observedAt: z.string(),
});
export type DriverStatus = z.infer<typeof driverStatusSchema>;
