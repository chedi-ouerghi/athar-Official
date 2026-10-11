/**
 * Typed, immutable application configuration derived from the validated
 * environment.
 *
 * Everything else in the service receives an {@link AppConfig} through the
 * {@link APP_CONFIG} token instead of reaching for `process.env`, which makes
 * configuration injectable, testable and discoverable.
 */

import type { Environment } from './environment.schema.js';

/** Fully resolved runtime configuration. */
export interface AppConfig {
  readonly nodeEnv: Environment['NODE_ENV'];
  /** Interface the HTTP server binds to. */
  readonly host: string;
  /** TCP port the HTTP server listens on. */
  readonly port: number;
  readonly logLevel: Environment['LOG_LEVEL'];
  readonly shutdownTimeoutMs: number;
  readonly serviceName: string;
  readonly serviceVersion: string;
}

/** Dependency-injection token for {@link AppConfig}. */
export const APP_CONFIG = Symbol('APP_CONFIG');

/**
 * Derive the application configuration from a validated environment.
 *
 * @param environment - Result of `parseEnvironment`.
 * @param serviceVersion - Version taken from the package manifest.
 */
export function createAppConfig(environment: Environment, serviceVersion: string): AppConfig {
  return {
    nodeEnv: environment.NODE_ENV,
    host: environment.HOST,
    port: environment.PORT,
    logLevel: environment.LOG_LEVEL,
    shutdownTimeoutMs: environment.SHUTDOWN_TIMEOUT_MS,
    serviceName: 'athar-api',
    serviceVersion,
  };
}
