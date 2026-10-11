import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  healthResponseSchema,
  readyResponseSchema,
  apiErrorResponseSchema,
} from '@athar/contracts';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createConfiguredApp } from '../src/bootstrap.js';
import { createTestConfig } from './create-test-config.js';

/**
 * HTTP-level integration tests.
 *
 * These exercise the fully wired application — routing, versioning, the global
 * exception filter and the shared response contracts — rather than
 * individual units.
 */
describe('ATHAR API (HTTP)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createConfiguredApp(createTestConfig());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /health', () => {
    it('reports the service as alive', async () => {
      const response = await request(app.getHttpServer()).get('/health').expect(200);

      const payload = healthResponseSchema.parse(response.body);

      expect(payload.status).toBe('ok');
      expect(payload.service).toBe('athar-api');
      expect(payload.version).toBe('0.1.0-test');
      expect(payload.uptimeSeconds).toBeGreaterThanOrEqual(0);
    });

    it('is not mounted under the versioned prefix', async () => {
      await request(app.getHttpServer()).get('/api/health').expect(404);
    });

    it('does not leak configuration or infrastructure details', async () => {
      const response = await request(app.getHttpServer()).get('/health').expect(200);
      const serialised = JSON.stringify(response.body);

      // The payload is asserted against the contract, so any additional field
      // would already fail `healthResponseSchema`. This guards the intent:
      // no host, port, environment or log level may appear.
      expect(serialised).not.toContain('127.0.0.1');
      expect(serialised).not.toContain('NODE_ENV');
      expect(serialised).not.toContain('LOG_LEVEL');
      expect(Object.keys(response.body as object).sort()).toStrictEqual([
        'service',
        'status',
        'timestamp',
        'uptimeSeconds',
        'version',
      ]);
    });
  });

  describe('GET /ready', () => {
    it('reports readiness with passing probes', async () => {
      const response = await request(app.getHttpServer()).get('/ready').expect(200);

      const payload = readyResponseSchema.parse(response.body);

      expect(payload.status).toBe('ok');
      expect(payload.checks.map((check) => check.name).sort()).toStrictEqual([
        'configuration',
        'event-loop',
      ]);
    });

    it('is not mounted under the versioned prefix', async () => {
      await request(app.getHttpServer()).get('/api/ready').expect(404);
    });
  });

  describe('error contract', () => {
    it('returns the standard error envelope for an unknown route', async () => {
      const response = await request(app.getHttpServer()).get('/does-not-exist').expect(404);

      const payload = apiErrorResponseSchema.parse(response.body);

      expect(payload.error.code).toBe('NOT_FOUND');
      expect(payload.error.requestId).toEqual(expect.any(String));
      expect(payload.error.timestamp).toEqual(expect.any(String));
    });

    it('echoes a caller-supplied correlation id', async () => {
      const correlationId = 'test-correlation-id';

      const response = await request(app.getHttpServer())
        .get('/does-not-exist')
        .set('x-request-id', correlationId)
        .expect(404);

      expect(apiErrorResponseSchema.parse(response.body).error.requestId).toBe(correlationId);
    });

    it('rejects a malformed JSON body with VALIDATION_FAILED', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/anything')
        .set('content-type', 'application/json')
        .send('{"unterminated": ')
        .expect(400);

      expect(apiErrorResponseSchema.parse(response.body).error.code).toBe('BAD_REQUEST');
    });
  });
});
