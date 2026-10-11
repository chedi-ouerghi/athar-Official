import { describe, expect, it } from 'vitest';
import { StartupConfigurationError } from '../src/config/startup-configuration.error.js';
import { HARDWARE_MODE_UNAVAILABLE_MESSAGE } from '../src/device/create-table-driver.js';
import { SimulatedTableDriver } from '../src/device/simulated-table-driver.js';
import { TABLE_DRIVER, type TableDriver } from '../src/device/table-driver.js';
import { createTestApp } from './create-test-app.js';

/**
 * The device layer as the application wires it: the driver bound to its token
 * when the module graph is built, and the refusal of `hardware` happening
 * there, before anything could listen.
 */
describe('device layer in the application', () => {
  it('binds the simulator to TABLE_DRIVER by default', async () => {
    const app = await createTestApp();

    try {
      const driver = app.get<TableDriver>(TABLE_DRIVER);

      expect(driver).toBeInstanceOf(SimulatedTableDriver);
      expect(driver.mode).toBe('simulation');
      expect(await driver.getStatus('table-001')).toMatchObject({
        mode: 'simulation',
        phase: 'idle',
      });
    } finally {
      await app.close();
    }
  });

  it('stops the simulator ticking when the application closes', async () => {
    const app = await createTestApp();
    const driver = app.get<SimulatedTableDriver>(TABLE_DRIVER);

    expect(driver.running).toBe(true);

    await app.close();

    expect(driver.running).toBe(false);
  });

  it('refuses to start with TABLE_MODE=hardware, with the documented message', async () => {
    const failure = await createTestApp({ TABLE_MODE: 'hardware' }).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(StartupConfigurationError);
    expect((failure as StartupConfigurationError).message).toBe(HARDWARE_MODE_UNAVAILABLE_MESSAGE);
  });
});
