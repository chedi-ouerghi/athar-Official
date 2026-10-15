import { Module, type DynamicModule } from '@nestjs/common';
import { CLOCK, systemClock, type Clock } from '../device/clock.js';
import { AccountRepository } from './account.repository.js';
import { AccountsService } from './accounts.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { LoginThrottle } from './login-throttle.js';
import { SessionGuard } from './session.guard.js';
import { SessionRepository } from './session.repository.js';

export interface AuthModuleOptions {
  /** Opened by the caller, so a bad file fails before Nest starts. */
  readonly accounts: AccountRepository;
  readonly sessions: SessionRepository;
  /** Defaults to the system clock. */
  readonly clock?: Clock;
}

/**
 * Accounts and sessions. Global, so any controller can use `SessionGuard` and
 * `@Roles(...)` without importing this module.
 */
@Module({})
export class AuthModule {
  static forRoot(options: AuthModuleOptions): DynamicModule {
    return {
      module: AuthModule,
      global: true,
      controllers: [AuthController],
      providers: [
        { provide: AccountRepository, useValue: options.accounts },
        { provide: SessionRepository, useValue: options.sessions },
        { provide: CLOCK, useValue: options.clock ?? systemClock },
        LoginThrottle,
        AccountsService,
        AuthService,
        SessionGuard,
      ],
      exports: [AccountsService, AuthService, SessionGuard],
    };
  }
}
