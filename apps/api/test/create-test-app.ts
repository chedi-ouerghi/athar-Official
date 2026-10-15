import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AccountRole, SessionResponse } from '@athar/contracts';
import type { AppModuleOptions } from '../src/app.module.js';
import { AccountRepository } from '../src/auth/account.repository.js';
import { AccountsService } from '../src/auth/accounts.service.js';
import { AuthService } from '../src/auth/auth.service.js';
import { SessionRepository } from '../src/auth/session.repository.js';
import { createConfiguredApp } from '../src/bootstrap.js';
import { FakeClock, ManualScheduler } from '../src/device/fake-clock.js';
import type { SimulatedTableDriver } from '../src/device/simulated-table-driver.js';
import { TABLE_DRIVER } from '../src/device/table-driver.js';
import { JobsService } from '../src/jobs/jobs.service.js';
import { InMemoryTableRepository } from '../src/tables/in-memory-table.repository.js';
import { createTestConfig } from './create-test-config.js';
import { fixtureTables } from './table-fixtures.js';

/** The password of every account the helpers below create. Not a secret. */
export const TEST_PASSWORD = 'test-password-0123456789';

/**
 * The real application with in-memory repositories (tables seeded from
 * fixtures, no accounts, no sessions), so no test touches the file system or
 * depends on a developer's data files.
 */
export function createTestApp(
  environment: Record<string, unknown> = {},
  options: Partial<AppModuleOptions> = {},
): Promise<NestExpressApplication> {
  return createConfiguredApp(createTestConfig(environment), {
    ...options,
    repository: options.repository ?? new InMemoryTableRepository(fixtureTables()),
    accounts: options.accounts ?? AccountRepository.inMemory(),
    sessions: options.sessions ?? SessionRepository.inMemory(),
  });
}

/**
 * Create an account of `role` in a running application and sign it in, through
 * the real services: an admin as `admin:create` makes one, a customer with an
 * activation code as an admin would hand it out. Returns the session.
 */
export async function signIn(
  app: NestExpressApplication,
  role: AccountRole = 'admin',
  email = `${role}-${randomUUID()}@athar.test`,
): Promise<SessionResponse> {
  const accounts = app.get(AccountsService);
  const auth = app.get(AuthService);

  if (role === 'admin') {
    await accounts.createAdmin({ email, displayName: 'Test admin', password: TEST_PASSWORD });
    return auth.login({ email, password: TEST_PASSWORD }, 'test');
  }

  const { activationCode } = await accounts.createCustomer({ email, displayName: 'Test customer' });
  return auth.activate({ email, activationCode, password: TEST_PASSWORD }, 'test');
}

/** The header that carries a session's access token. */
export function bearer(session: Pick<SessionResponse, 'accessToken'>): { Authorization: string } {
  return { Authorization: `Bearer ${session.accessToken}` };
}

/**
 * An application whose time the test controls.
 *
 * The clock only moves when `advance` is called, and the simulator's ticks only run
 * when it ticks them, so a drawing that takes minutes passes in microseconds and
 * nothing depends on real timers. The speed factor is high by default, so a design
 * takes a few seconds of fake time.
 */
export interface TimedApp {
  readonly app: NestExpressApplication;
  readonly clock: FakeClock;
  readonly driver: SimulatedTableDriver;
  readonly jobs: JobsService;
  /** Move the clock on, let the simulator notice, and wait for the jobs to catch up. */
  advance(seconds: number): Promise<void>;
  /** Wait for every driver event so far to have been applied to its job. */
  settle(): Promise<void>;
}

export async function createTimedApp(
  environment: Record<string, unknown> = {},
  options: Partial<AppModuleOptions> = {},
): Promise<TimedApp> {
  const clock = options.clock instanceof FakeClock ? options.clock : new FakeClock();
  const scheduler = new ManualScheduler();
  const app = await createTestApp(
    { SIMULATION_SPEED_FACTOR: '100', ...environment },
    { ...options, clock, scheduler },
  );
  const driver = app.get<SimulatedTableDriver>(TABLE_DRIVER);
  const jobs = app.get(JobsService);

  const settle = async (): Promise<void> => {
    await jobs.whenIdle();
  };

  return {
    app,
    clock,
    driver,
    jobs,
    settle,
    advance: async (seconds) => {
      clock.advanceSeconds(seconds);
      scheduler.tick();
      await settle();
    },
  };
}
