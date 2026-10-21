import { Module, type DynamicModule } from '@nestjs/common';
import { CLOCK, systemClock, type Clock } from '../device/clock.js';
import { GUEST_LOOKUP } from '../tables/guest-lookup.js';
import { AccessController } from './access.controller.js';
import { TableAccessRepository } from './access.repository.js';
import { AccessService } from './access.service.js';

export interface AccessModuleOptions {
  /** Opened by the caller, so a bad file fails before Nest starts. */
  readonly access: TableAccessRepository;
  /** Defaults to the system clock. */
  readonly clock?: Clock;
}

/**
 * Claim tokens, sharing and guests. Global, so the tables module can find out who
 * is a guest (`GUEST_LOOKUP`) and the admin controller can issue claim codes
 * without importing this module.
 */
@Module({})
export class AccessModule {
  static forRoot(options: AccessModuleOptions): DynamicModule {
    return {
      module: AccessModule,
      global: true,
      controllers: [AccessController],
      providers: [
        { provide: TableAccessRepository, useValue: options.access },
        { provide: GUEST_LOOKUP, useExisting: TableAccessRepository },
        { provide: CLOCK, useValue: options.clock ?? systemClock },
        AccessService,
      ],
      exports: [AccessService, GUEST_LOOKUP],
    };
  }
}
