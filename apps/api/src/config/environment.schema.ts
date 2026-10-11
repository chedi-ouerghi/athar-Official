/**
 * Zod schema for every environment variable the API reads at boot.
 *
 * Validation happens once, at startup, so a misconfigured deployment fails
 * immediately and loudly instead of surfacing as a confusing runtime error on
 * the first request.
 */

import { z } from 'zod';

/** Pino log levels, ordered from most to least verbose. */
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

/** Accepts a numeric string or number and coerces it to an integer. */
const INTEGER = z.coerce.number().int();

export const environmentSchema = z.object({
  /** Runtime mode. Drives log formatting and the startup banner. */
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  /**
   * Interface the HTTP server binds to.
   *
   * `0.0.0.0` is the default on purpose: binding to `127.0.0.1` would make the
   * API unreachable from an Android emulator or from a physical device on the
   * same network.
   */
  HOST: z.string().min(1).default('0.0.0.0'),

  /** TCP port the HTTP server listens on. `0` lets the OS pick a free port. */
  PORT: INTEGER.min(0).max(65535).default(3000),

  /** Minimum log level emitted by the service. */
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),

  /** Grace period, in milliseconds, allowed for in-flight requests on shutdown. */
  SHUTDOWN_TIMEOUT_MS: INTEGER.min(0).default(10_000),
});

/** Validated, typed view of `process.env`. */
export type Environment = z.infer<typeof environmentSchema>;

/** Shape of the raw, unvalidated environment handed to {@link parseEnvironment}. */
export type RawEnvironment = Record<string, unknown>;

/**
 * Raised when the process environment does not satisfy
 * {@link environmentSchema}.
 */
export class EnvironmentValidationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(
      `Invalid environment configuration:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`,
    );
    this.name = 'EnvironmentValidationError';
  }
}

/**
 * Validate a raw environment object, throwing a single aggregated error that
 * lists every problem at once rather than only the first.
 */
export function parseEnvironment(raw: RawEnvironment): Environment {
  const result = environmentSchema.safeParse(raw);

  if (result.success) {
    return result.data;
  }

  const issues = result.error.issues.map(
    (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
  );

  throw new EnvironmentValidationError(issues);
}
