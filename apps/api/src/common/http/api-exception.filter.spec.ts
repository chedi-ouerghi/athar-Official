import {
  BadRequestException,
  HttpException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  type ArgumentsHost,
} from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiErrorCodeSchema, apiErrorResponseSchema } from '@athar/contracts';
import { ValidationFailedException } from '../validation/validation-failed.exception.js';
import { ApiExceptionFilter } from './api-exception.filter.js';
import { DomainException, ERROR_CODE_STATUS } from './domain.exception.js';

interface Captured {
  status: number;
  body: unknown;
}

/** Run the filter against a fake HTTP context and capture what it answers. */
function run(
  exception: unknown,
  request: { id?: string; headers?: Record<string, string> } = {},
): Captured {
  const captured: Captured = { status: 0, body: undefined };
  const response = {
    status(code: number) {
      captured.status = code;
      return {
        json(body: unknown) {
          captured.body = body;
        },
      };
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ url: '/api/v1/test', method: 'GET', ...request }),
    }),
  } as unknown as ArgumentsHost;

  new ApiExceptionFilter().catch(exception, host);

  return captured;
}

/** The standard envelope's `error` object, parsed against the shared contract. */
function errorOf(captured: Captured) {
  return apiErrorResponseSchema.parse(captured.body).error;
}

describe('ApiExceptionFilter', () => {
  // The filter logs every rejection; keep the test output readable.
  beforeAll(() => Logger.overrideLogger(false));
  afterAll(() => Logger.overrideLogger(['log', 'error', 'warn']));

  describe('domain exceptions', () => {
    it('maps every contract error code to a status', () => {
      expect(Object.keys(ERROR_CODE_STATUS).sort()).toStrictEqual(
        [...apiErrorCodeSchema.options].sort(),
      );
    });

    it.each(apiErrorCodeSchema.options)('reports %s verbatim, with its own status', (code) => {
      const captured = run(new DomainException(code, 'Something specific.'));
      const error = errorOf(captured);

      expect(error.code).toBe(code);
      expect(error.message).toBe('Something specific.');
      expect(captured.status).toBe(ERROR_CODE_STATUS[code]);
    });

    it('answers 401 for UNAUTHORIZED', () => {
      expect(run(new DomainException('UNAUTHORIZED', 'Authentication is required.')).status).toBe(
        401,
      );
    });

    it.each([
      'TABLE_DISABLED',
      'TABLE_OFFLINE',
      'TABLE_BUSY',
      'INVALID_TRANSITION',
      'IDEMPOTENCY_CONFLICT',
    ] as const)('answers 409 for %s', (code) => {
      expect(run(new DomainException(code, 'Conflict.')).status).toBe(409);
    });

    it.each(['TABLE_NOT_FOUND', 'DESIGN_NOT_FOUND', 'JOB_NOT_FOUND'] as const)(
      'answers 404 for %s',
      (code) => {
        expect(run(new DomainException(code, 'Missing.')).status).toBe(404);
      },
    );

    it('is not mistaken for a generic framework error with the same status', () => {
      // A bare 409 has no contract code of its own; a domain 409 must keep its.
      expect(errorOf(run(new HttpException('Conflict', 409))).code).toBe('BAD_REQUEST');
      expect(errorOf(run(new DomainException('TABLE_BUSY', 'Busy.'))).code).toBe('TABLE_BUSY');
    });

    it('carries no field details and always includes a request id and timestamp', () => {
      const error = errorOf(run(new DomainException('TABLE_BUSY', 'Busy.')));

      expect(error).not.toHaveProperty('details');
      expect(error.requestId.length).toBeGreaterThan(0);
      expect(Date.parse(error.timestamp)).not.toBeNaN();
    });
  });

  describe('framework errors keep their existing behaviour', () => {
    it('maps NotFoundException to NOT_FOUND', () => {
      const captured = run(new NotFoundException('Cannot GET /x'));

      expect(captured.status).toBe(404);
      expect(errorOf(captured).code).toBe('NOT_FOUND');
    });

    it('maps BadRequestException to BAD_REQUEST', () => {
      const captured = run(new BadRequestException('Nope'));

      expect(captured.status).toBe(400);
      expect(errorOf(captured).code).toBe('BAD_REQUEST');
    });

    it('maps ServiceUnavailableException to SERVICE_UNAVAILABLE', () => {
      const captured = run(new ServiceUnavailableException('Down'));

      expect(captured.status).toBe(503);
      expect(errorOf(captured).code).toBe('SERVICE_UNAVAILABLE');
    });

    it('reports any other 4xx HttpException as BAD_REQUEST with its own status', () => {
      const captured = run(new HttpException('Teapot', 418));

      expect(captured.status).toBe(418);
      expect(errorOf(captured).code).toBe('BAD_REQUEST');
    });

    it('maps a 5xx HttpException other than 503 to INTERNAL_SERVER_ERROR', () => {
      const captured = run(new HttpException('Upstream', 502));

      expect(captured.status).toBe(502);
      expect(errorOf(captured).code).toBe('INTERNAL_SERVER_ERROR');
    });

    it('maps ValidationFailedException to VALIDATION_FAILED with details', () => {
      const captured = run(
        new ValidationFailedException([{ path: 'body.name', message: 'Too short' }]),
      );
      const error = errorOf(captured);

      expect(captured.status).toBe(400);
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.details).toStrictEqual([{ path: 'body.name', message: 'Too short' }]);
    });

    it('reports a body-parser style error as a client error with a generic message', () => {
      const parserError = Object.assign(new SyntaxError('Unexpected token } in JSON at 12'), {
        status: 400,
      });
      const captured = run(parserError);
      const error = errorOf(captured);

      expect(captured.status).toBe(400);
      expect(error.code).toBe('BAD_REQUEST');
      expect(error.message).toBe('The request could not be read.');
    });

    it('never leaks the message of an unexpected error', () => {
      const captured = run(new Error('connect ECONNREFUSED postgres://user:pw@10.0.0.5/db'));
      const error = errorOf(captured);

      expect(captured.status).toBe(500);
      expect(error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(error.message).toBe('An unexpected error occurred.');
      expect(JSON.stringify(captured.body)).not.toContain('postgres');
    });
  });

  describe('correlation id', () => {
    it('prefers the id assigned by the request logger', () => {
      const captured = run(new DomainException('TABLE_BUSY', 'Busy.'), {
        id: 'logger-id',
        headers: { 'x-request-id': 'header-id' },
      });

      expect(errorOf(captured).requestId).toBe('logger-id');
    });

    it('falls back to the inbound header', () => {
      const captured = run(new DomainException('TABLE_BUSY', 'Busy.'), {
        headers: { 'x-request-id': 'header-id' },
      });

      expect(errorOf(captured).requestId).toBe('header-id');
    });
  });
});
