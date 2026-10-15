/**
 * Shared error contract.
 *
 * Every non-2xx response produced by the API serialises to this shape, so the
 * mobile client has exactly one error format to reason about.
 */

import { z } from 'zod';

/**
 * Stable, machine-readable error identifiers.
 *
 * These values are part of the public contract: clients may branch on them,
 * so renaming one is a breaking change.
 */
export const apiErrorCodeSchema = z.enum([
  'BAD_REQUEST',
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'INTERNAL_SERVER_ERROR',
  'SERVICE_UNAVAILABLE',
  // Domain codes. Added additively, which the v1 versioning policy allows.
  'TABLE_NOT_FOUND',
  'DESIGN_NOT_FOUND',
  'JOB_NOT_FOUND',
  'TABLE_DISABLED',
  'TABLE_OFFLINE',
  'TABLE_BUSY',
  'INVALID_TRANSITION',
  'IDEMPOTENCY_CONFLICT',
  // Accounts and sessions.
  'UNAUTHORIZED',
  'INVALID_CREDENTIALS',
  'SESSION_EXPIRED',
  'FORBIDDEN',
  'TOO_MANY_REQUESTS',
  'ACTIVATION_INVALID',
  // Ownership and plans.
  'PAIRING_REQUIRED',
  'FEATURE_NOT_IN_PLAN',
]);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

/** Per-field validation failure detail. */
export const apiErrorDetailSchema = z.object({
  /** Dotted path to the offending value, e.g. `body.limit`. */
  path: z.string(),
  message: z.string(),
});
export type ApiErrorDetail = z.infer<typeof apiErrorDetailSchema>;

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    /** Present only for validation failures. */
    details: z.array(apiErrorDetailSchema).optional(),
    /** Correlates the response with the server-side log entry. */
    requestId: z.string(),
    timestamp: z.string(),
  }),
});
export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;
