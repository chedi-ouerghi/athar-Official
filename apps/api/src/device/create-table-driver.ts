import { randomUUID } from 'node:crypto';
import { connect } from 'mqtt';
import type { AppConfig } from '../config/app-config.js';
import { intervalScheduler, systemClock, type Clock, type Scheduler } from './clock.js';
import { MqttTableDriver, type MqttClientLike } from './hardware/mqtt-table-driver.js';
import { SimulatedTableDriver } from './simulated-table-driver.js';
import type { TableDriver } from './table-driver.js';

/** What a driver may need from its surroundings; defaults to the real ones. */
export interface TableDriverDependencies {
  readonly clock?: Clock;
  readonly scheduler?: Scheduler;
  /** Hardware mode: stands in for the broker connection, so tests need no broker. */
  readonly mqttClient?: MqttClientLike;
}

/**
 * Build the driver selected by `TABLE_MODE`.
 *
 * This is the single place the mode decides anything. It runs while the module
 * graph is created, before the server binds a port.
 *
 * `hardware` starts connecting to the broker here but does not wait for it: the
 * client keeps retrying, and every table reads as offline until the broker (and
 * the table's own presence) has been heard. An unreachable broker therefore shows
 * up as "table offline", not as an API that cannot start.
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

    case 'hardware': {
      const { url, username, password } = config.mqtt;

      const client =
        dependencies.mqttClient ??
        connect(url, {
          clientId: `athar-api-${randomUUID()}`,
          clean: true,
          reconnectPeriod: 2_000,
          connectTimeout: 10_000,
          ...(username === undefined ? {} : { username }),
          ...(password === undefined ? {} : { password }),
        });

      return new MqttTableDriver({ client });
    }
  }
}
