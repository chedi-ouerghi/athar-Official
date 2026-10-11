import { Module, type DynamicModule } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from './app-config.js';

/**
 * Exposes the validated {@link AppConfig} to the whole application.
 *
 * Registered as a global module so that feature modules can inject the
 * configuration without every module having to import this one explicitly.
 */
@Module({})
export class AppConfigModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppConfigModule,
      global: true,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
