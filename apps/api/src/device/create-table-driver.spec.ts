import { describe, expect, it } from 'vitest';
import { createTestConfig } from '../../test/create-test-config.js';
import { StartupConfigurationError } from '../config/startup-configuration.error.js';
import { FakeClock, ManualScheduler } from './fake-clock.js';
import { HARDWARE_MODE_UNAVAILABLE_MESSAGE, createTableDriver } from './create-table-driver.js';
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
    it('refuses with a StartupConfigurationError', () => {
      expect(() => createTableDriver(createTestConfig({ TABLE_MODE: 'hardware' }))).toThrow(
        StartupConfigurationError,
      );
    });

    it('uses the message the documentation promises, word for word', () => {
      expect(HARDWARE_MODE_UNAVAILABLE_MESSAGE).toBe(
        'TABLE_MODE=hardware is not available: no hardware table driver is installed in this build.\n' +
          'Set TABLE_MODE=simulation.',
      );
      expect(() => createTableDriver(createTestConfig({ TABLE_MODE: 'hardware' }))).toThrow(
        HARDWARE_MODE_UNAVAILABLE_MESSAGE,
      );
    });

    it('starts no ticking before refusing', () => {
      const scheduler = new ManualScheduler();

      expect(() =>
        createTableDriver(createTestConfig({ TABLE_MODE: 'hardware' }), { scheduler }),
      ).toThrow(StartupConfigurationError);
      expect(scheduler.active).toBe(0);
    });
  });
});
