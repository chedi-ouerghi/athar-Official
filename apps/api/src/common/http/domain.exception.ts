/**
 * Exceptions that carry their own contract error code.
 *
 * The exception filter derives a code from the HTTP status for framework errors
 * (which cannot express "table busy"), but a domain failure already knows
 * exactly which code the client should branch on. Throw a `DomainException`
 * instead of an `HttpException` and the filter reports that code verbatim.
 *
 * ```ts
 * throw new DomainException('TABLE_BUSY', 'The table already has an active job.');
 * ```
 */

import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiErrorCode } from '@athar/contracts';

/**
 * HTTP status of every contract error code, from docs/architecture.md section 5.
 *
 * Typed as a complete `Record`, so adding a code to `@athar/contracts` fails the
 * type check here until its status is decided.
 */
export const ERROR_CODE_STATUS: Readonly<Record<ApiErrorCode, number>> = {
  BAD_REQUEST: HttpStatus.BAD_REQUEST,
  VALIDATION_FAILED: HttpStatus.BAD_REQUEST,
  UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
  INVALID_CREDENTIALS: HttpStatus.UNAUTHORIZED,
  SESSION_EXPIRED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  TOO_MANY_REQUESTS: HttpStatus.TOO_MANY_REQUESTS,
  ACTIVATION_INVALID: HttpStatus.BAD_REQUEST,
  ACCOUNT_EXISTS: HttpStatus.CONFLICT,
  PAIRING_REQUIRED: HttpStatus.CONFLICT,
  FEATURE_NOT_IN_PLAN: HttpStatus.FORBIDDEN,
  PAIRING_TOKEN_INVALID: HttpStatus.BAD_REQUEST,
  TABLE_ALREADY_CLAIMED: HttpStatus.CONFLICT,
  DESIGN_READ_ONLY: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  TABLE_NOT_FOUND: HttpStatus.NOT_FOUND,
  DESIGN_NOT_FOUND: HttpStatus.NOT_FOUND,
  JOB_NOT_FOUND: HttpStatus.NOT_FOUND,
  TABLE_DISABLED: HttpStatus.CONFLICT,
  TABLE_OFFLINE: HttpStatus.CONFLICT,
  TABLE_BUSY: HttpStatus.CONFLICT,
  INVALID_TRANSITION: HttpStatus.CONFLICT,
  IDEMPOTENCY_CONFLICT: HttpStatus.CONFLICT,
  INTERNAL_SERVER_ERROR: HttpStatus.INTERNAL_SERVER_ERROR,
  SERVICE_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
};

/** Shape of the response body, read back by `ApiExceptionFilter`. */
export interface DomainExceptionBody {
  readonly code: ApiErrorCode;
  readonly message: string;
}

export class DomainException extends HttpException {
  /**
   * @param code - Contract error code; also decides the HTTP status.
   * @param message - Safe to show to a client: never put internals in it.
   */
  constructor(
    readonly code: ApiErrorCode,
    message: string,
  ) {
    const body: DomainExceptionBody = { code, message };

    super(body, ERROR_CODE_STATUS[code]);
  }
}
