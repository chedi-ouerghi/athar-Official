/**
 * Design contracts: the public view of a drawing design.
 *
 * The full trajectory is deliberately absent. It is internal to the API and its
 * drawing engine and never crosses the HTTP boundary. What the app receives to
 * draw a picture of the design is `previewPath`, a small downsampled path
 * derived from the trajectory.
 */

import { z } from 'zod';

/** Lowercase letters, digits and hyphens; used for both ids and slugs. */
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const designIdSchema = z.string().regex(SLUG_PATTERN, 'Invalid design id').max(64);
export type DesignId = z.infer<typeof designIdSchema>;

// ---------------------------------------------------------------------------
// Localisation
// ---------------------------------------------------------------------------

/** Languages the product ships with. */
export const localeSchema = z.enum(['en', 'ar']);
export type Locale = z.infer<typeof localeSchema>;

/**
 * Text available in every supported language. The API returns all languages and
 * the app picks one, so changing language needs no extra request.
 */
export const localizedTextSchema = z.object({
  en: z.string().min(1),
  ar: z.string().min(1),
});
export type LocalizedText = z.infer<typeof localizedTextSchema>;

// ---------------------------------------------------------------------------
// Inspiration
// ---------------------------------------------------------------------------

/**
 * Where a design's inspiration comes from.
 *
 * `documented-traditional` means "we can point to documentation", so it must
 * list at least one source. `original-modern` is an original interpretation and
 * may list none.
 */
export const inspirationKindSchema = z.enum(['documented-traditional', 'original-modern']);
export type InspirationKind = z.infer<typeof inspirationKindSchema>;

export const inspirationSourceSchema = z.object({
  label: z.string().min(1),
  url: z.url().optional(),
});
export type InspirationSource = z.infer<typeof inspirationSourceSchema>;

export const designInspirationSchema = z
  .object({
    kind: inspirationKindSchema,
    /** Note shown on the design details screen. */
    note: localizedTextSchema,
    sources: z.array(inspirationSourceSchema),
  })
  .refine(
    (inspiration) =>
      inspiration.kind !== 'documented-traditional' || inspiration.sources.length > 0,
    {
      message: 'A documented traditional design requires at least one source.',
      path: ['sources'],
    },
  );
export type DesignInspiration = z.infer<typeof designInspirationSchema>;

// ---------------------------------------------------------------------------
// Preview path
// ---------------------------------------------------------------------------

/** Upper bound on the number of points in a `previewPath`. */
export const PREVIEW_PATH_MAX_POINTS = 500;

/**
 * Downsampled picture of a design, in the same `polar-theta-rho/v1` convention
 * as the trajectory it is derived from: `[theta, rho]` with theta in radians
 * (unwrapped, so it may exceed 2π) and rho normalised to the table radius
 * (0 centre, 1 edge). Points are ordered along the path and are resampled at
 * roughly equal path-length intervals, so a fraction of the path length maps to
 * a fraction of the points.
 *
 * The app draws it, and reuses it on the progress screen to show the part drawn
 * so far. It is not the trajectory and must never be sent to a driver.
 */
export const previewPathSchema = z
  .array(z.tuple([z.number(), z.number().min(0).max(1)]))
  .min(2)
  .max(PREVIEW_PATH_MAX_POINTS);
export type PreviewPath = z.infer<typeof previewPathSchema>;

// ---------------------------------------------------------------------------
// Design
// ---------------------------------------------------------------------------

/** A design as listed in `GET /api/v1/designs`. Excludes `previewPath` to stay small. */
export const designSummarySchema = z.object({
  id: designIdSchema,
  slug: designIdSchema,
  title: localizedTextSchema,
  description: localizedTextSchema,
  inspiration: designInspirationSchema,
  /** Estimate shown to users. Drives the simulator's pace. */
  estimatedDurationSeconds: z.number().int().positive(),
});
export type DesignSummary = z.infer<typeof designSummarySchema>;

/** A design as returned by `GET /api/v1/designs/:designId`. */
export const designDetailSchema = designSummarySchema.extend({
  previewPath: previewPathSchema,
});
export type DesignDetail = z.infer<typeof designDetailSchema>;

/** Path parameters of `GET /api/v1/designs/:designId`. */
export const designParamsSchema = z.object({ designId: designIdSchema });
export type DesignParams = z.infer<typeof designParamsSchema>;

/** Payload of `GET /api/v1/designs`. */
export const listDesignsResponseSchema = z.object({
  /** Version of the static design collection. */
  collectionVersion: z.number().int().positive(),
  designs: z.array(designSummarySchema),
});
export type ListDesignsResponse = z.infer<typeof listDesignsResponseSchema>;

/** Payload of `GET /api/v1/designs/:designId`. */
export const getDesignResponseSchema = designDetailSchema;
export type GetDesignResponse = DesignDetail;
