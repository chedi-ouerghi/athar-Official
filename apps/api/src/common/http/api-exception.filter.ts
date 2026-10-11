/**
 * Normalises every unhandled error into the single error envelope declared by
 * `@athar/contracts`, so clients never have to parse two different shapes.
 */

import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ApiErrorCode, ApiErrorDetail } from '@athar/contracts';
import { ValidationFailedException } from '../validation/validation-failed.exception.js';

/**
 * Minimal structural view of the Express response.
 *
 * Declaring it here keeps the filter independent of the concrete HTTP adapter
 * and avoids a direct dependency on `express` just for two method signatures.
 */
interface HttpResponse {
  status(code: number): { json(body: unknown): unknown };
}

/**
 * Request surface the filter reads.
 *
 * `pino-http` assigns `id` to every request it sees, but errors raised by
 * earlier middleware (for example a malformed JSON body) never reach it, so the
 * correlation id is also read from the header directly.
 */
interface HttpRequest {
  readonly id?: string | number;
  readonly url?: string;
  readonly method?: string;
  readonly headers?: Record<string, string | string[] | undefined>;
}

/** Header carrying a caller-supplied correlation id. */
const REQUEST_ID_HEADER = 'x-request-id';

/** Upper bound on an accepted inbound correlation id. */
const MAX_REQUEST_ID_LENGTH = 128;

/** Body shape produced by exceptions thrown inside this application. */
interface ErrorBody {
  readonly code?: unknown;
  readonly message?: unknown;
  readonly details?: unknown;
}

/** HTTP status to contract error code. */
const STATUS_TO_CODE: Readonly<Record<number, ApiErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

/** Lowest status in the 5xx range; anything at or above it is a server fault. */
const INTERNAL_ERROR_STATUS = 500;

interface NormalisedError {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly message: string;
  readonly details?: readonly ApiErrorDetail[];
}

/**
 * Extract a field-level detail list from an exception body, ignoring anything
 * that does not match the contract shape.
 */
function readDetails(body: unknown): ApiErrorDetail[] | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }

  const { details } = body as ErrorBody;
  if (!Array.isArray(details)) {
    return undefined;
  }

  const parsed = details.filter(
    (detail): detail is ApiErrorDetail =>
      typeof detail === 'object' &&
      detail !== null &&
      typeof (detail as ApiErrorDetail).path === 'string' &&
      typeof (detail as ApiErrorDetail).message === 'string',
  );

  return parsed.length > 0 ? parsed : undefined;
}

/** Best-effort extraction of a human-readable message from an exception body. */
function readMessage(body: unknown, fallback: string): string {
  if (body === null || body === undefined) {
    return fallback;
  }

  if (typeof body === 'string') {
    return body;
  }

  if (typeof body === 'object' && typeof (body as ErrorBody).message === 'string') {
    return (body as ErrorBody).message as string;
  }

  return fallback;
}

/**
 * Read an HTTP status from an error that bypassed the Nest exception layer.
 *
 * Body-parser failures (`SyntaxError` with `status: 400`, payload-too-large,
 * and similar) are raised by Express middleware before routing and therefore
 * never become `HttpException` instances, yet they still carry a meaningful
 * status that must not be reported as a server fault.
 */
function readForeignStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }

  const { status, statusCode } = error as { status?: unknown; statusCode?: unknown };
  const candidate = typeof status === 'number' ? status : statusCode;

  return typeof candidate === 'number' && Number.isInteger(candidate) ? candidate : undefined;
}

/** Map an exception onto status, contract code, message and field details. */
function normalise(exception: unknown): NormalisedError {
  if (exception instanceof ValidationFailedException) {
    return {
      status: exception.getStatus(),
      code: 'VALIDATION_FAILED',
      message: readMessage(exception.getResponse(), 'Request validation failed.'),
      details: exception.details,
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const response = exception.getResponse();
    const code =
      STATUS_TO_CODE[status] ??
      (status >= INTERNAL_ERROR_STATUS ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST');

    const normalised: NormalisedError = {
      status,
      code,
      message: readMessage(response, exception.message),
    };

    const details = readDetails(response);
    return details ? { ...normalised, details } : normalised;
  }

  const foreignStatus = readForeignStatus(exception);
  if (foreignStatus !== undefined && foreignStatus >= 400 && foreignStatus < 500) {
    return {
      status: foreignStatus,
      code: STATUS_TO_CODE[foreignStatus] ?? 'BAD_REQUEST',
      // The parser message can quote fragments of the offending payload, so a
      // generic message is returned instead.
      message: 'The request could not be read.',
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: 'INTERNAL_SERVER_ERROR',
    // The raw error is never surfaced: it can embed file paths or connection
    // strings. The full error stays in the server log.
    message: 'An unexpected error occurred.',
  };
}

/**
 * Resolve the correlation id reported to the client and used in the log line.
 *
 * Precedence: the id assigned by the request logger, then an inbound header,
 * then a freshly generated id. A response always carries an id, so an operator
 * can always find the matching log entry.
 */
function resolveRequestId(request: HttpRequest): string {
  if (request.id !== undefined && String(request.id).length > 0) {
    return String(request.id);
  }

  const header = request.headers?.[REQUEST_ID_HEADER];
  const value = Array.isArray(header) ? header[0] : header;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0 && trimmed.length <= MAX_REQUEST_ID_LENGTH) {
      return trimmed;
    }
  }

  return randomUUID();
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<HttpResponse>();
    const request = http.getRequest<HttpRequest>();

    const { status, code, message, details } = normalise(exception);
    const requestId = resolveRequestId(request);

    this.log(status, code, message, requestId, request, exception);

    const error: {
      code: ApiErrorCode;
      message: string;
      details?: readonly ApiErrorDetail[];
      requestId: string;
      timestamp: string;
    } = {
      code,
      message,
      requestId,
      timestamp: new Date().toISOString(),
    };

    if (details) {
      error.details = details;
    }

    response.status(status).json({ error });
  }

  /**
   * Server-side failures are logged with their stack trace; rejected requests
   * are logged at warn level because they are an expected, client-driven
   * outcome rather than a fault.
   */
  private log(
    status: number,
    code: ApiErrorCode,
    message: string,
    requestId: string,
    request: HttpRequest,
    exception: unknown,
  ): void {
    const context = `${request.method ?? '-'} ${request.url ?? '-'}`;
    const summary = `[${requestId}] ${code} ${status} ${context} - ${message}`;

    if (status >= INTERNAL_ERROR_STATUS) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(summary, stack);
      return;
    }

    this.logger.warn(summary);
  }
}
