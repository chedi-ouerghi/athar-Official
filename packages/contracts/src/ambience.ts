/**
 * LED ambience contracts: the light a table can show (decision D3: part of the
 * `personalized` plan, feature `ledAmbiences`).
 *
 * The list itself is data in the API (`designs/data/ambiences.v1.ts`); the app
 * reads it from `GET /api/v1/ambiences` and never hard-codes it.
 */

import { z } from 'zod';
import { designIdSchema, localizedTextSchema } from './design.js';

/** Same slug rules as a design id. */
export const ambienceIdSchema = designIdSchema;
export type AmbienceId = z.infer<typeof ambienceIdSchema>;

export const ambienceSchema = z.object({
  id: ambienceIdSchema,
  name: localizedTextSchema,
  /** `#rrggbb`, for the app's swatch. The hardware maps the id, not this value. */
  color: z.string().regex(/^#[0-9a-f]{6}$/, 'Expected a lowercase #rrggbb colour'),
});
export type Ambience = z.infer<typeof ambienceSchema>;

/** Payload of `GET /api/v1/ambiences`. */
export const listAmbiencesResponseSchema = z.object({ ambiences: z.array(ambienceSchema) });
export type ListAmbiencesResponse = z.infer<typeof listAmbiencesResponseSchema>;

/** Body of `PUT /api/v1/tables/:tableId/ambience`. The response is the updated table. */
export const setAmbienceRequestSchema = z.object({ ambienceId: ambienceIdSchema });
export type SetAmbienceRequest = z.infer<typeof setAmbienceRequestSchema>;
