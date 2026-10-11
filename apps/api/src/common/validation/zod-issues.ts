/**
 * Converts a Zod issue tree into the flat, transport-level detail shape
 * declared by `@athar/contracts`.
 */

import type { z } from 'zod';
import type { ApiErrorDetail } from '@athar/contracts';

/** A single issue as produced by `ZodError.issues`. */
export type ZodIssue = z.core.$ZodIssue;

/**
 * Prefix a Zod issue path with the location it was found in (`body`, `query`,
 * `params`) so the reported path is unambiguous to the client.
 */
function toDottedPath(base: string, issuePath: readonly PropertyKey[]): string {
  return [base, ...issuePath.map((segment) => String(segment))].join('.');
}

/**
 * Flatten Zod issues into contract-compatible details.
 *
 * Nested issues keep their full path, which keeps client-side field mapping
 * straightforward.
 */
export function toErrorDetails(base: string, issues: readonly ZodIssue[]): ApiErrorDetail[] {
  return issues.map((issue) => ({
    path: toDottedPath(base, issue.path),
    message: issue.message,
  }));
}
