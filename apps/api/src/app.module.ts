import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import type { AppConfig } from './config/app-config.js';
import { AppConfigModule } from './config/app-config.module.js';
import { ApiExceptionFilter } from './common/http/api-exception.filter.js';
import { createLoggerModule } from './logging/create-logger.module.js';
import { ShutdownCoordinator } from './lifecycle/shutdown-coordinator.service.js';
import { HealthModule } from './health/health.module.js';
import { DesignsModule } from './designs/designs.module.js';
import type { Scheduler } from './device/clock.js';
import { systemClock } from './device/clock.js';
import { JobsModule } from './jobs/jobs.module.js';
import { DeviceModule } from './device/device.module.js';
import { TablesModule, type TablesModuleOptions } from './tables/tables.module.js';
import { AuthModule, type AuthModuleOptions } from './auth/auth.module.js';

/**
 * Application composition root.
 *
 * `AppModule.forRoot(config, options)` receives the already-validated
 * configuration instead of reading `process.env`, and already-opened
 * repositories instead of opening files, which keeps the module graph free of
 * ambient state and lets integration tests build the real application with an
 * explicit configuration and an in-memory repository.
 */
/**
 * What a test may replace. The repositories are required: the caller opens them,
 * so a bad data file stops the process before Nest starts. The `clock` is shared
 * by the driver, the tables, the jobs and the sessions, so they always agree on
 * the time.
 */
export interface AppModuleOptions extends TablesModuleOptions, AuthModuleOptions {
  /** Drives the simulator's ticks. Defaults to real timers. */
  readonly scheduler?: Scheduler;
}

@Module({})
export class AppModule {
  static forRoot(config: AppConfig, options: AppModuleOptions): DynamicModule {
    const clock = options.clock ?? systemClock;

    return {
      module: AppModule,
      imports: [
        createLoggerModule(config),
        AppConfigModule.forRoot(config),
        DeviceModule.forRoot(config, {
          clock,
          ...(options.scheduler === undefined ? {} : { scheduler: options.scheduler }),
        }),
        AuthModule.forRoot({ ...options, clock }),
        TablesModule.forRoot({ ...options, clock }),
        DesignsModule.forRoot(),
        JobsModule.forRoot({ historyLimit: config.jobHistoryLimit, clock }),
        HealthModule,
      ],
      providers: [
        // Registered through `APP_FILTER` rather than `useGlobalFilters` so
        // that every application built from this module — including the one
        // created in integration tests — is covered by it automatically.
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        ShutdownCoordinator,
      ],
    };
  }
}
