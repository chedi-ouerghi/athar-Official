import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

/** Operational probes and their supporting logic. */
@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
