import { Module, type DynamicModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import type { AppConfig } from './config/app-config.js';
import { AppConfigModule } from './config/app-config.module.js';
import { ApiExceptionFilter } from './common/http/api-exception.filter.js';
import { createLoggerModule } from './logging/create-logger.module.js';
import { ShutdownCoordinator } from './lifecycle/shutdown-coordinator.service.js';
import { HealthModule } from './health/health.module.js';

/**
 * Application composition root.
 *
 * `AppModule.forRoot(config)` receives the already-validated configuration
 * instead of reading `process.env`, which keeps the module graph free of
 * ambient state and lets integration tests build the real application with an
 * explicit configuration.
 */
@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [createLoggerModule(config), AppConfigModule.forRoot(config), HealthModule],
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
