/**
 * The MQTT protocol between the API and the controller on a table (a Raspberry
 * Pi). It is not the HTTP contract: a protocol revision must not force an HTTP
 * version bump, so it has its own `v` field and its own module.
 *
 * Directions, all on `athar/v1/t/{tableId}/...`:
 *
 * - `cmd`      API -> table, QoS 1. Every command carries a `cmdId`; the table
 *              deduplicates on it, because QoS 1 may deliver twice.
 * - `ack`      table -> API, QoS 1. Sent when a command is *accepted*, not when
 *              the drawing is finished (that takes minutes and arrives as status).
 * - `status`   table -> API, retained. Progress while drawing.
 * - `presence` table -> API, retained. `offline` is the MQTT Last Will, so the
 *              broker reports a table that vanished.
 *
 * Messages never carry credentials.
 */

import { z } from 'zod';
import { lightSchema } from './ambience.js';
import { driverErrorCodeSchema, driverStatusSchema } from './device.js';
import { tableGeometrySchema } from './geometry.js';
import { tableIdSchema } from './table.js';

/** Protocol version carried by every message. */
export const DEVICE_PROTOCOL_VERSION = 1 as const;

/** How long the API waits for an `ack` before the command fails with `OFFLINE`. */
export const DEVICE_ACK_TIMEOUT_MS = 5_000;

/** Most points a trajectory sent to a table may have (designs are far smaller). */
export const TRAJECTORY_MAX_POINTS = 50_000;

/** `polar-theta-rho/v1`: `[theta, rho]`, theta unwrapped radians, rho 0..1. */
export const trajectorySchema = z.object({
  format: z.literal('polar-theta-rho/v1'),
  points: z
    .array(z.tuple([z.number().finite(), z.number().min(0).max(1)]))
    .min(2)
    .max(TRAJECTORY_MAX_POINTS),
});
export type WireTrajectory = z.infer<typeof trajectorySchema>;

const envelope = {
  v: z.literal(DEVICE_PROTOCOL_VERSION),
  cmdId: z.uuid(),
  sentAt: z.iso.datetime(),
};

/** API -> table. */
export const deviceCommandSchema = z.discriminatedUnion('type', [
  z.object({
    ...envelope,
    type: z.literal('start'),
    jobId: z.uuid(),
    trajectory: trajectorySchema,
    /**
     * The table's shape and size, so the controller can scale the normalised
     * trajectory to it (the mapping is in `geometry.ts`). Absent from an API
     * older than the sizes: a controller then assumes its own configured size.
     */
    geometry: tableGeometrySchema.optional(),
    /** Informative: a real table takes as long as it takes. */
    estimatedDurationSeconds: z.number().positive().optional(),
  }),
  z.object({ ...envelope, type: z.literal('pause'), jobId: z.uuid() }),
  z.object({ ...envelope, type: z.literal('resume'), jobId: z.uuid() }),
  z.object({ ...envelope, type: z.literal('stop'), jobId: z.uuid() }),
  z.object({ ...envelope, type: z.literal('light'), light: lightSchema }),
]);
export type DeviceCommand = z.infer<typeof deviceCommandSchema>;
export type DeviceCommandType = DeviceCommand['type'];

/** table -> API. `errorCode` is set when `ok` is false and only then. */
export const deviceAckSchema = z
  .object({
    v: z.literal(DEVICE_PROTOCOL_VERSION),
    cmdId: z.uuid(),
    ok: z.boolean(),
    errorCode: driverErrorCodeSchema.nullable(),
  })
  .refine((ack) => ack.ok === (ack.errorCode === null), {
    message: 'errorCode must be null if and only if ok is true',
    path: ['errorCode'],
  });
export type DeviceAck = z.infer<typeof deviceAckSchema>;

/** table -> API. The driver snapshot, plus the light the table currently shows. */
export const deviceStatusMessageSchema = driverStatusSchema.extend({
  v: z.literal(DEVICE_PROTOCOL_VERSION),
  light: lightSchema.nullable().default(null),
});
export type DeviceStatusMessage = z.infer<typeof deviceStatusMessageSchema>;

/** table -> API. `offline` is published by the broker as the Last Will. */
export const devicePresenceSchema = z.enum(['online', 'offline']);
export type DevicePresence = z.infer<typeof devicePresenceSchema>;

/**
 * The four topics of a table. The id is validated, so one containing `/`, `+`
 * or `#` can never address (or subscribe to) another table's topics.
 */
export function deviceTopics(tableId: string) {
  const id = tableIdSchema.parse(tableId);
  const base = `athar/v1/t/${id}`;

  return {
    cmd: `${base}/cmd`,
    ack: `${base}/ack`,
    status: `${base}/status`,
    presence: `${base}/presence`,
  } as const;
}
export type DeviceTopics = ReturnType<typeof deviceTopics>;
