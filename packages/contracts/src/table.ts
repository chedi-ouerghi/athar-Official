/**
 * Table contracts: the public view of a sand table.
 *
 * A table id is **public and non-secret**. It is printed in QR codes, so
 * knowing one is never proof of authorisation: the QR code identifies a table,
 * and only a session of its owner (or an admin) may read it.
 */

import { z } from 'zod';
import { driverConnectionSchema, tableModeSchema } from './device.js';
import { featureSchema, planSchema } from './entitlements.js';

/**
 * Public table identifier: lowercase letters, digits and hyphens, 3 to 40
 * characters. Shared by the API (path validation) and the mobile link parser so
 * both accept exactly the same ids.
 */
export const TABLE_ID_PATTERN = /^[a-z0-9-]{3,40}$/;
export const tableIdSchema = z.string().regex(TABLE_ID_PATTERN, 'Invalid table id');
export type TableId = z.infer<typeof tableIdSchema>;

/**
 * Whether the calling session may start a drawing now, and if not, why. Computed
 * per session: another session of the same owner, or an admin, is not paired.
 */
export const tableReadinessSchema = z.object({
  /** This session holds a live pairing with the table (`POST .../pairing`). */
  paired: z.boolean(),
  /** The driver is reachable (not `offline` or `error`). */
  online: z.boolean(),
  /** No job is active on the table. */
  free: z.boolean(),
  /** `enabled && paired && online && free`. */
  canStart: z.boolean(),
});
export type TableReadiness = z.infer<typeof tableReadinessSchema>;

export const tableSchema = z.object({
  id: tableIdSchema,
  displayName: z.string(),
  /** Human label such as a room or venue name. */
  location: z.string(),
  /** Operator switch. A disabled table accepts no new jobs. */
  enabled: z.boolean(),
  /** Taken from the driver, never from the client. */
  mode: tableModeSchema,
  /** Driver connection, reported as `busy` while a job is active. */
  connection: driverConnectionSchema,
  /** Lets a second visitor open the running job. */
  activeJobId: z.string().nullable(),
  /** What was ordered. */
  plan: planSchema,
  /** The voice-assistant add-on, independent of the plan. */
  voiceAssistant: z.boolean(),
  /** What the table can do, derived from `plan` and `voiceAssistant` by `featuresFor`. */
  features: z.array(featureSchema),
  /** LED ambience the table shows (from the driver), or `null` before one was set. */
  ambienceId: z.string().min(1).nullable(),
  /** The drawing conditions, for the calling session. */
  readiness: tableReadinessSchema,
});
export type Table = z.infer<typeof tableSchema>;

/** Path parameters of `GET /api/v1/tables/:tableId`. */
export const tableParamsSchema = z.object({ tableId: tableIdSchema });
export type TableParams = z.infer<typeof tableParamsSchema>;

/** Payload of `GET /api/v1/tables/:tableId`. */
export const getTableResponseSchema = tableSchema;
export type GetTableResponse = Table;

/**
 * Payload of `POST /api/v1/tables/:tableId/pairing`: the session's pairing with
 * the table (decision D9). It slides: every pairing request and every successful
 * job start or command pushes `expiresAt` 15 minutes past that moment.
 */
export const pairingSchema = z.object({
  tableId: tableIdSchema,
  expiresAt: z.string(),
});
export type Pairing = z.infer<typeof pairingSchema>;
