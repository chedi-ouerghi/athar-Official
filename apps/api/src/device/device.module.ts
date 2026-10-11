import { Module, type DynamicModule } from '@nestjs/common';
import type { AppConfig } from '../config/app-config.js';
import { createTableDriver, type TableDriverDependencies } from './create-table-driver.js';
import { TABLE_DRIVER } from './table-driver.js';

/**
 * Binds the table driver selected by `TABLE_MODE` to the `TABLE_DRIVER` token.
 *
 * The driver is built when the module is *described*, not lazily, so that an
 * unusable mode (`hardware`) throws while `AppModule.forRoot` runs, before the
 * application exists and long before it listens. Global, because every module
 * that talks to a table needs the token and none should import this one.
 *
 * Nest calls `onModuleDestroy` on the driver when the application closes, which
 * stops the simulator's tick.
 */
@Module({})
export class DeviceModule {
  static forRoot(config: AppConfig, dependencies: TableDriverDependencies = {}): DynamicModule {
    const driver = createTableDriver(config, dependencies);

    return {
      module: DeviceModule,
      global: true,
      providers: [{ provide: TABLE_DRIVER, useValue: driver }],
      exports: [TABLE_DRIVER],
    };
  }
}
