/**
 * Builds the real application with an explicit, deterministic configuration.
 *
 * Integration tests must not depend on `.env` files or on the developer's
 * shell environment, so the configuration is constructed here and injected
 * through the same `AppModule.forRoot` entry point production uses.
 */

import { createAppConfig, type AppConfig } from '../src/config/app-config.js';
import { parseEnvironment } from '../src/config/environment.schema.js';

/** Version reported by the API while under test. */
export const TEST_SERVICE_VERSION = '0.1.0-test';

/**
 * @param overrides - Environment values to override after the defaults.
 */
export function createTestConfig(overrides: Record<string, unknown> = {}): AppConfig {
  const environment = parseEnvironment({
    NODE_ENV: 'test',
    HOST: '127.0.0.1',
    // 0 lets the OS choose; tests drive the app through `app.getHttpServer()`
    // rather than a fixed port.
    PORT: '0',
    LOG_LEVEL: 'silent',
    ...overrides,
  });

  return createAppConfig(environment, TEST_SERVICE_VERSION);
}
