import { Module, type DynamicModule } from '@nestjs/common';
import { CLOCK, systemClock, type Clock } from '../device/clock.js';
import { AccountRepository } from './account.repository.js';
import { AccountsService } from './accounts.service.js';
import { AdminAdminsController } from './admin-admins.controller.js';
import { AdminCustomersController } from './admin-customers.controller.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { CustomersService } from './customers.service.js';
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
 * Accounts, sessions and the admin customer endpoints. Global, so any
 * controller can use `SessionGuard`, `@Roles(...)` and `CustomersService`
 * without importing this module.
 */
@Module({})
export class AuthModule {
  static forRoot(options: AuthModuleOptions): DynamicModule {
    return {
      module: AuthModule,
      global: true,
      controllers: [AuthController, AdminAdminsController, AdminCustomersController],
      providers: [
        { provide: AccountRepository, useValue: options.accounts },
        { provide: SessionRepository, useValue: options.sessions },
        { provide: CLOCK, useValue: options.clock ?? systemClock },
        LoginThrottle,
        AccountsService,
        AuthService,
        CustomersService,
        SessionGuard,
      ],
      exports: [AccountsService, AuthService, CustomersService, SessionGuard],
    };
  }
}
