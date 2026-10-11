import { describe, expect, it } from 'vitest';
import { healthResponseSchema, readyResponseSchema } from '@athar/contracts';
import { HealthService } from './health.service.js';
import { createTestConfig } from '../../test/create-test-config.js';

describe('HealthService', () => {
  it('reports a healthy liveness payload', () => {
    const service = new HealthService(createTestConfig());

    const health = healthResponseSchema.parse(service.getHealth());

    expect(health).toStrictEqual({
      status: 'ok',
      service: 'athar-api',
      version: '0.1.0-test',
      timestamp: health.timestamp,
      uptimeSeconds: 0,
    });
    expect(Date.parse(health.timestamp)).not.toBeNaN();
  });

  it('reports the configured service name and version', () => {
    const service = new HealthService(createTestConfig());

    const health = service.getHealth();

    expect(health.service).toBe(createTestConfig().serviceName);
    expect(health.version).toBe(createTestConfig().serviceVersion);
  });

  it('reports all probes as passing', async () => {
    const service = new HealthService(createTestConfig());

    const readiness = readyResponseSchema.parse(await service.getReadiness());

    expect(readiness.status).toBe('ok');
    expect(readiness.checks).toStrictEqual([
      { name: 'configuration', status: 'ok' },
      { name: 'event-loop', status: 'ok' },
    ]);
  });

  it('reports readiness as degraded when configuration is unusable', async () => {
    // An empty service name can only occur if configuration bypassed
    // validation, so this simulates a corrupted runtime state.
    const service = new HealthService({ ...createTestConfig(), serviceName: '' });

    const readiness = await service.getReadiness();

    expect(readiness.status).toBe('error');
    expect(readiness.checks).toContainEqual({ name: 'configuration', status: 'error' });
  });
});
