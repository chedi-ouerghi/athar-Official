/**
 * Typed, immutable application configuration derived from the validated
 * environment.
 *
 * Everything else in the service receives an {@link AppConfig} through the
 * {@link APP_CONFIG} token instead of reaching for `process.env`, which makes
 * configuration injectable, testable and discoverable.
 */

import { resolve } from 'node:path';
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
  /** Which table driver is bound; `hardware` cannot start yet. */
  readonly tableMode: Environment['TABLE_MODE'];
  /** Simulator: divisor applied to simulated durations. */
  readonly simulationSpeedFactor: number;
  /** Simulator: every Nth job faults; 0 means never. */
  readonly simulationFaultEveryNthJob: number;
  /** Simulator: progress at which an injected fault occurs. */
  readonly simulationFaultAtProgress: number;
  /** Drawing jobs kept per table. */
  readonly jobHistoryLimit: number;
  /** Absolute path of the JSON file that stores registered tables. */
  readonly tablesDataFile: string;
  /**
   * Secret for the admin endpoints, or undefined (development and test only),
   * in which case they refuse everyone. **Never log this object whole.**
   */
  readonly adminApiKey: string | undefined;
  /** Origin for QR links, without a trailing slash; undefined in development. */
  readonly publicLinkBaseUrl: string | undefined;
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
    tableMode: environment.TABLE_MODE,
    simulationSpeedFactor: environment.SIMULATION_SPEED_FACTOR,
    simulationFaultEveryNthJob: environment.SIMULATION_FAULT_EVERY_NTH_JOB,
    simulationFaultAtProgress: environment.SIMULATION_FAULT_AT_PROGRESS,
    jobHistoryLimit: environment.JOB_HISTORY_LIMIT,
    tablesDataFile: resolve(environment.TABLES_DATA_FILE),
    adminApiKey: environment.ADMIN_API_KEY,
    publicLinkBaseUrl: environment.PUBLIC_LINK_BASE_URL,
    serviceName: 'athar-api',
    serviceVersion,
  };
}
