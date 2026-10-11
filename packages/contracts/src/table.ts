/**
 * Table contracts: the public view of a sand table.
 *
 * A table id is **public and non-secret**. It is printed in QR codes, so
 * knowing one is never proof of authorisation.
 */

import { z } from 'zod';
import { driverConnectionSchema, tableModeSchema } from './device.js';

/**
 * Public table identifier: lowercase letters, digits and hyphens, 3 to 40
 * characters. Shared by the API (path validation) and the mobile link parser so
 * both accept exactly the same ids.
 */
export const TABLE_ID_PATTERN = /^[a-z0-9-]{3,40}$/;
export const tableIdSchema = z.string().regex(TABLE_ID_PATTERN, 'Invalid table id');
export type TableId = z.infer<typeof tableIdSchema>;

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
});
export type Table = z.infer<typeof tableSchema>;

/** Path parameters of `GET /api/v1/tables/:tableId`. */
export const tableParamsSchema = z.object({ tableId: tableIdSchema });
export type TableParams = z.infer<typeof tableParamsSchema>;

/** Payload of `GET /api/v1/tables/:tableId`. */
export const getTableResponseSchema = tableSchema;
export type GetTableResponse = Table;
