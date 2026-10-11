import { Module, type DynamicModule } from '@nestjs/common';
import { CLOCK, systemClock, type Clock } from '../device/clock.js';
import { ACTIVE_JOB_LOOKUP } from '../tables/active-job-lookup.js';
import { InMemoryJobRepository } from './in-memory-job.repository.js';
import { JOB_REPOSITORY, type JobRepository } from './job-repository.js';
import { JobsController } from './jobs.controller.js';
import { JobsService } from './jobs.service.js';
import { TableJobsController } from './table-jobs.controller.js';

export interface JobsModuleOptions {
  /** Jobs remembered per table. */
  readonly historyLimit: number;
  /** Defaults to the system clock. Pass the one the driver uses, so they agree. */
  readonly clock?: Clock;
  /** Defaults to the in-memory repository. */
  readonly repository?: JobRepository;
}

/**
 * Drawing jobs.
 *
 * Global, and it provides `ACTIVE_JOB_LOOKUP`: the seam `tables` was built with.
 * `tables` knows only that one-method interface, so it never imports jobs, and
 * this module can depend on tables without a cycle. It needs `TABLE_DRIVER`,
 * `TableRegistry` and `DesignsService`, all of which are provided globally.
 */
@Module({})
export class JobsModule {
  static forRoot(options: JobsModuleOptions): DynamicModule {
    return {
      module: JobsModule,
      global: true,
      controllers: [TableJobsController, JobsController],
      providers: [
        {
          provide: JOB_REPOSITORY,
          useValue: options.repository ?? new InMemoryJobRepository(options.historyLimit),
        },
        { provide: CLOCK, useValue: options.clock ?? systemClock },
        JobsService,
        { provide: ACTIVE_JOB_LOOKUP, useExisting: JobsService },
      ],
      exports: [JobsService, ACTIVE_JOB_LOOKUP],
    };
  }
}
