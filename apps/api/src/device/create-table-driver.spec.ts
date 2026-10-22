import { describe, expect, it } from 'vitest';
import { createTestConfig } from '../../test/create-test-config.js';
import { FakeClock, ManualScheduler } from './fake-clock.js';
import { createTableDriver } from './create-table-driver.js';
import { FakeMqttClient } from './hardware/fake-mqtt-client.js';
import { MqttTableDriver } from './hardware/mqtt-table-driver.js';
import { SimulatedTableDriver } from './simulated-table-driver.js';

describe('createTableDriver', () => {
  it('builds the simulator by default, and starts its ticking', () => {
    const scheduler = new ManualScheduler();

    const driver = createTableDriver(createTestConfig(), { clock: new FakeClock(), scheduler });

    expect(driver).toBeInstanceOf(SimulatedTableDriver);
    expect(driver.mode).toBe('simulation');
    expect(scheduler.active).toBe(1);
  });

  it('passes the simulation settings through', async () => {
    const clock = new FakeClock();
    const driver = createTableDriver(
      createTestConfig({
        SIMULATION_SPEED_FACTOR: '10',
        SIMULATION_FAULT_EVERY_NTH_JOB: '1',
        SIMULATION_FAULT_AT_PROGRESS: '0.5',
      }),
      { clock, scheduler: new ManualScheduler() },
    );

    await driver.startJob('table-001', {
      jobId: 'job-1',
      estimatedDurationSeconds: 100,
      trajectory: {
        format: 'polar-theta-rho/v1',
        points: [
          [0, 0],
          [6, 1],
        ],
      },
    });
    clock.advanceSeconds(5);

    expect(await driver.getStatus('table-001')).toMatchObject({
      phase: 'failed',
      progress: 0.5,
      errorCode: 'SIMULATED_FAULT',
    });
  });

  describe('TABLE_MODE=hardware', () => {
    it('builds the MQTT driver, and starts no simulator ticking', () => {
      const scheduler = new ManualScheduler();

      const driver = createTableDriver(createTestConfig({ TABLE_MODE: 'hardware' }), {
        scheduler,
        mqttClient: new FakeMqttClient(),
      });

      expect(driver).toBeInstanceOf(MqttTableDriver);
      expect(driver.mode).toBe('hardware');
      expect(scheduler.active).toBe(0);
    });

    it('does not wait for the broker: every table reads as offline until it is heard', async () => {
      const driver = createTableDriver(createTestConfig({ TABLE_MODE: 'hardware' }), {
        mqttClient: new FakeMqttClient(),
      });

      expect(await driver.getStatus('table-001')).toMatchObject({
        mode: 'hardware',
        connection: 'offline',
      });
    });
  });
});
