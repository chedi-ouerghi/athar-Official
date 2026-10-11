import { Inject, Injectable } from '@nestjs/common';
import type { HealthResponse, ReadyResponse, ReadinessCheck } from '@athar/contracts';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { TABLE_DRIVER, type TableDriver } from '../device/table-driver.js';
import { TableRegistry } from '../tables/table-registry.service.js';

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

  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(TABLE_DRIVER) private readonly driver: TableDriver,
    private readonly tables: TableRegistry,
  ) {}

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
   * Readiness verifies that the process can serve traffic: configuration
   * resolved at boot, the event loop responsive, and the table driver able to
   * answer for every registered table. As dependencies are introduced (database,
   * cache), their probes are added here — that is the single place a new
   * dependency becomes readiness-relevant.
   *
   * `tableMode` says whether the driver is simulated or physical, and nothing
   * else about it: no seed data, durations or fault settings.
   */
  async getReadiness(): Promise<ReadyResponse> {
    const checks: ReadinessCheck[] = [
      { name: 'configuration', status: this.isConfigurationUsable() ? 'ok' : 'error' },
      { name: 'event-loop', status: (await this.checkEventLoop()).status },
      { name: 'table-driver', status: (await this.isTableDriverUsable()) ? 'ok' : 'error' },
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
      tableMode: this.driver.mode,
      checks,
    };
  }

  /**
   * The driver is constructed (the process would not have started otherwise) and
   * answers for every registered table. Which table failed, and why, is not
   * returned: a failing probe is a reason to look at the logs.
   */
  private async isTableDriverUsable(): Promise<boolean> {
    try {
      for (const table of await this.tables.list()) {
        await this.driver.getStatus(table.id);
      }

      return true;
    } catch {
      return false;
    }
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
