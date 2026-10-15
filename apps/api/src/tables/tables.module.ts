import { Module, type DynamicModule } from '@nestjs/common';
import { CLOCK, systemClock, type Clock } from '../device/clock.js';
import { AdminTablesController } from './admin-tables.controller.js';
import { generateTableId } from './table-id.js';
import { TABLE_REPOSITORY, type TableRepository } from './table-repository.js';
import {
  TABLE_ID_GENERATOR,
  TableRegistry,
  type TableIdGenerator,
} from './table-registry.service.js';
import { TablesController } from './tables.controller.js';
import { TablesService } from './tables.service.js';

export interface TablesModuleOptions {
  /** Where tables are stored. The caller opens it, so a bad file fails before Nest starts. */
  readonly repository: TableRepository;
  /** Defaults to the system clock. */
  readonly clock?: Clock;
  /** Defaults to random 80-bit ids. A test can force a collision. */
  readonly generateId?: TableIdGenerator;
}

/**
 * Registered tables: the public table endpoint and the admin provisioning.
 *
 * Depends on the `TABLE_DRIVER` token (global, from `DeviceModule`) and on
 * `APP_CONFIG`. It knows nothing about jobs: `ACTIVE_JOB_LOOKUP` is the seam, and
 * `JobsModule` provides it. Global, so that `jobs` and `health` can use the
 * registry without importing this module (which has no useful static form).
 */
@Module({})
export class TablesModule {
  static forRoot(options: TablesModuleOptions): DynamicModule {
    return {
      module: TablesModule,
      global: true,
      controllers: [TablesController, AdminTablesController],
      providers: [
        { provide: TABLE_REPOSITORY, useValue: options.repository },
        { provide: CLOCK, useValue: options.clock ?? systemClock },
        { provide: TABLE_ID_GENERATOR, useValue: options.generateId ?? generateTableId },
        TableRegistry,
        TablesService,
      ],
      exports: [TableRegistry, TablesService, TABLE_REPOSITORY],
    };
  }
}
