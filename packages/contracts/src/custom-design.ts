/**
 * A design drawn by a customer, saved on their account. Unlike the catalogue,
 * which is code, custom designs are data the owner can create and delete.
 * Kept apart from `design.ts` because it needs `drawingPathSchema`, and
 * `drawing-job.ts` already imports `design.ts`.
 */

import { z } from 'zod';
import { drawingPathSchema } from './drawing-job.js';

export const customDesignNameSchema = z.string().trim().min(1).max(80);

export const customDesignSchema = z.object({
  id: z.uuid(),
  name: customDesignNameSchema,
  path: drawingPathSchema,
  createdAt: z.iso.datetime(),
});
export type CustomDesign = z.infer<typeof customDesignSchema>;

/** Body of `POST /api/v1/designs/custom` (`201`: the saved design). */
export const createCustomDesignRequestSchema = z.object({
  name: customDesignNameSchema,
  path: drawingPathSchema,
});
export type CreateCustomDesignRequest = z.infer<typeof createCustomDesignRequestSchema>;

/** Payload of `GET /api/v1/designs/custom`, newest first. */
export const listCustomDesignsResponseSchema = z.object({ designs: z.array(customDesignSchema) });
export type ListCustomDesignsResponse = z.infer<typeof listCustomDesignsResponseSchema>;

/** Path parameters of `DELETE /api/v1/designs/custom/:designId` (`204`). */
export const customDesignParamsSchema = z.object({ designId: z.uuid() });
export type CustomDesignParams = z.infer<typeof customDesignParamsSchema>;
