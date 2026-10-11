/**
 * Operational probes.
 *
 * These routes are deliberately mounted outside the versioned API prefix and
 * are addressed by infrastructure (load balancers, orchestrators, uptime
 * monitors) rather than by the mobile client, so their paths stay stable for
 * the life of the service.
 */

import { Controller, Get, HttpCode, HttpStatus, Res, VERSION_NEUTRAL } from '@nestjs/common';
import type { HealthResponse, ReadyResponse } from '@athar/contracts';
import { HealthService } from './health.service.js';

/** Minimal structural view of the Express response. */
interface HttpResponse {
  status(code: number): { json(body: unknown): unknown };
}

@Controller({ version: VERSION_NEUTRAL })
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Liveness probe. Answers as long as the HTTP server is able to serve a
   * request; it performs no dependency checks by design.
   */
  @Get('health')
  @HttpCode(HttpStatus.OK)
  getHealth(): HealthResponse {
    return this.healthService.getHealth();
  }

  /**
   * Readiness probe. Returns 503 when a probe fails so orchestrators can take
   * the instance out of rotation without parsing the body.
   */
  @Get('ready')
  async getReadiness(@Res({ passthrough: true }) response: HttpResponse): Promise<ReadyResponse> {
    const readiness = await this.healthService.getReadiness();

    response.status(readiness.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return readiness;
  }
}
