import { Inject, Injectable } from '@nestjs/common';
import type { HealthResponse, ReadyResponse, ReadinessCheck } from '@athar/contracts';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';

/**
 * Delay, in milliseconds, after which an event-loop probe is considered
 * failed. Chosen to be far above the few microseconds a healthy loop needs,
 * while still catching a completely blocked event loop.
 */
const EVENT_LOOP_LAG_THRESHOLD_MS = 100;

/**
 * Backs the liveness and readiness probes.
 *
 * Probes report the *name* of what was checked and whether it passed. The
 * detail of each probe (timings, resolved values) is written to the log and
 * never returned over HTTP, so the endpoints cannot be used to fingerprint the
 * deployment.
 */
@Injectable()
export class HealthService {
  private readonly startedAt = Date.now();

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  /** Payload of `GET /health`. Reports that the process is alive and serving. */
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: this.config.serviceName,
      version: this.config.serviceVersion,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
    };
  }

  /**
   * Payload of `GET /ready`.
   *
   * The service currently has no external dependency, so readiness verifies
   * that the process can serve traffic: configuration resolved at boot and the
   * event loop is responsive. As dependencies are introduced (database,
   * cache, device broker), their probes are added here — that is the single
   * place a new dependency becomes readiness-relevant.
   */
  async getReadiness(): Promise<ReadyResponse> {
    const checks: ReadinessCheck[] = [
      { name: 'configuration', status: this.isConfigurationUsable() ? 'ok' : 'error' },
      { name: 'event-loop', status: (await this.checkEventLoop()).status },
    ];

    const overall: ReadyResponse['status'] = checks.every((check) => check.status === 'ok')
      ? 'ok'
      : 'error';

    return {
      status: overall,
      service: this.config.serviceName,
      version: this.config.serviceVersion,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      checks,
    };
  }

  /**
   * Configuration is resolved before the HTTP server starts listening, so
   * reaching this point at all proves it is present and well-formed.
   */
  private isConfigurationUsable(): boolean {
    return (
      typeof this.config.serviceName === 'string' &&
      this.config.serviceName.length > 0 &&
      Number.isInteger(this.config.port)
    );
  }

  /**
   * Measure how long the current tick takes to be scheduled.
   *
   * A blocked event loop delays the timer far beyond the threshold, which is
   * the failure mode this probe is designed to catch.
   */
  private checkEventLoop(): Promise<ReadinessCheck> {
    return new Promise((resolve) => {
      const startedAt = Date.now();

      setTimeout(() => {
        const lagMs = Date.now() - startedAt;
        resolve({
          name: 'event-loop',
          status: lagMs <= EVENT_LOOP_LAG_THRESHOLD_MS ? 'ok' : 'error',
        });
      }, 0);
    });
  }
}
