import type { AppConfig } from '../config/app-config.js';
import { StartupConfigurationError } from '../config/startup-configuration.error.js';
import { intervalScheduler, systemClock, type Clock, type Scheduler } from './clock.js';
import { SimulatedTableDriver } from './simulated-table-driver.js';
import type { TableDriver } from './table-driver.js';

/**
 * What an operator sees when asking for `TABLE_MODE=hardware`. It names what is
 * unavailable and the exact setting to change, and `main.ts` prints it verbatim.
 */
export const HARDWARE_MODE_UNAVAILABLE_MESSAGE =
  'TABLE_MODE=hardware is not available: no hardware table driver is installed in this build.\n' +
  'Set TABLE_MODE=simulation.';

/** What a driver may need from its surroundings; defaults to the real ones. */
export interface TableDriverDependencies {
  readonly clock?: Clock;
  readonly scheduler?: Scheduler;
}

/**
 * Build the driver selected by `TABLE_MODE`.
 *
 * This is the single place the mode decides anything. It runs while the module
 * graph is created, before the server binds a port, so `hardware` makes the
 * process refuse to start instead of failing on the first request.
 *
 * @throws StartupConfigurationError for `hardware`, until a hardware driver
 *   exists. Adding one means adding a branch here and nothing else.
 */
export function createTableDriver(
  config: AppConfig,
  dependencies: TableDriverDependencies = {},
): TableDriver {
  switch (config.tableMode) {
    case 'simulation': {
      const driver = new SimulatedTableDriver({
        clock: dependencies.clock ?? systemClock,
        scheduler: dependencies.scheduler ?? intervalScheduler,
        speedFactor: config.simulationSpeedFactor,
        faultEveryNthJob: config.simulationFaultEveryNthJob,
        faultAtProgress: config.simulationFaultAtProgress,
      });

      driver.start();

      return driver;
    }

    case 'hardware':
      throw new StartupConfigurationError(HARDWARE_MODE_UNAVAILABLE_MESSAGE);
  }
}
