/**
 * Validation failure raised at the API boundary.
 *
 * Carries structured, field-level details so the HTTP layer can return a
 * predictable `VALIDATION_FAILED` response without the exception filter having
 * to understand Zod.
 */

import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiErrorCode, ApiErrorDetail } from '@athar/contracts';

interface ValidationFailedBody {
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly details: readonly ApiErrorDetail[];
}

export class ValidationFailedException extends HttpException {
  constructor(readonly details: readonly ApiErrorDetail[]) {
    const body: ValidationFailedBody = {
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed.',
      details,
    };

    super(body, HttpStatus.BAD_REQUEST);
  }
}
