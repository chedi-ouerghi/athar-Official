/**
 * Zod schema for every environment variable the API reads at boot.
 *
 * Validation happens once, at startup, so a misconfigured deployment fails
 * immediately and loudly instead of surfacing as a confusing runtime error on
 * the first request.
 */

import { isIP } from 'node:net';
import { z } from 'zod';

/**
 * Express's `trust proxy` value from `TRUST_PROXY`: a hop count (`1` behind one
 * reverse proxy such as Caddy), or a comma-separated list of proxy IPs or CIDRs.
 * Never `true`, which would let any client choose its own IP with
 * `X-Forwarded-For`. `undefined` for anything else.
 */
export function parseTrustProxy(text: string): number | string[] | undefined {
  const value = text.trim();

  if (/^\d{1,2}$/.test(value)) {
    return Number(value);
  }

  const entries = value.split(',').map((entry) => entry.trim());
  const valid = entries.every((entry) => {
    const [address = '', prefix, extra] = entry.split('/');
    const family = isIP(address);
    const bits = family === 4 ? 32 : 128;

    return (
      family !== 0 &&
      extra === undefined &&
      (prefix === undefined || (/^\d{1,3}$/.test(prefix) && Number(prefix) <= bits))
    );
  });

  return valid ? entries : undefined;
}

/** Pino log levels, ordered from most to least verbose. */
const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

/** Accepts a numeric string or number and coerces it to an integer. */
const INTEGER = z.coerce.number().int();

/** An unset variable and an empty one (`NAME=` in a dotenv file) mean the same thing. */
const optionalText = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value === '' ? undefined : value));

export const environmentSchema = z
  .object({
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

    /**
     * Which table driver the API talks to. `hardware` is accepted by the schema
     * but refused at startup until a hardware driver exists (see
     * `createTableDriver`), so the refusal has one clear, dedicated message.
     */
    TABLE_MODE: z.enum(['simulation', 'hardware']).default('simulation'),

    /** Divides simulated durations: `10` makes a 10-minute drawing take 1 minute. */
    SIMULATION_SPEED_FACTOR: z.coerce.number().positive().default(1),

    /** Every Nth simulated job faults; `0` disables injected faults. */
    SIMULATION_FAULT_EVERY_NTH_JOB: INTEGER.min(0).default(0),

    /** Progress (0..1) at which an injected simulated fault occurs. */
    SIMULATION_FAULT_AT_PROGRESS: z.coerce.number().min(0).max(1).default(0.6),

    /** Drawing jobs kept per table, newest first. Older finished jobs are forgotten. */
    JOB_HISTORY_LIMIT: INTEGER.min(1).default(20),

    /**
     * JSON file that stores the registered tables. Relative paths are resolved
     * against the working directory. It is created, with its directory, on first
     * start if missing. Must be on persistent storage in a real deployment.
     */
    TABLES_DATA_FILE: z.string().min(1).default('./data/tables.json'),

    /** JSON file that stores accounts (password hashes, never passwords). Same rules as tables. */
    ACCOUNTS_DATA_FILE: z.string().min(1).default('./data/accounts.json'),

    /** JSON file that stores sessions (token hashes, never tokens). Same rules as tables. */
    SESSIONS_DATA_FILE: z.string().min(1).default('./data/sessions.json'),

    /**
     * Origin used to build the link inside a table's QR code:
     * `<origin>/t/<tableId>`. Required in production. Always `https` with no port
     * and no credentials, because the app accepts only such links: a QR code it
     * would refuse is worse than none. Unset in development, where links use the
     * `athar://` scheme.
     */
    PUBLIC_LINK_BASE_URL: optionalText.transform((value) => value?.trim().replace(/\/+$/, '')),

    /**
     * Which reverse proxies to believe about the client's IP (`X-Forwarded-For`),
     * which the sign-in throttle keys on. Unset: trust none, use the socket's
     * address. See {@link parseTrustProxy}.
     */
    TRUST_PROXY: optionalText,
  })
  .superRefine((environment, context) => {
    const production = environment.NODE_ENV === 'production';

    if (
      environment.TRUST_PROXY !== undefined &&
      parseTrustProxy(environment.TRUST_PROXY) === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['TRUST_PROXY'],
        message:
          'must be a hop count such as 1, or a comma-separated list of proxy IPs or CIDRs (never true)',
      });
    }
    const base = environment.PUBLIC_LINK_BASE_URL;

    if (base === undefined) {
      if (production) {
        context.addIssue({
          code: 'custom',
          path: ['PUBLIC_LINK_BASE_URL'],
          message: 'is required when NODE_ENV=production',
        });
      }
      return;
    }

    let url: URL | undefined;
    try {
      url = new URL(base);
    } catch {
      url = undefined;
    }

    if (url === undefined || url.protocol !== 'https:') {
      context.addIssue({
        code: 'custom',
        path: ['PUBLIC_LINK_BASE_URL'],
        message: 'must be an absolute https origin such as https://app.athar.example',
      });
    } else if (
      url.pathname !== '/' ||
      // A dangling `?` or `#` leaves `search` and `hash` empty, so look at the text.
      /[?#]/.test(base) ||
      url.username !== '' ||
      url.password !== '' ||
      // Any explicit port, even :443, which `URL` would hide.
      /:\d*$/.test(base)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['PUBLIC_LINK_BASE_URL'],
        message: 'must be an origin only, with no port, path, query, fragment or credentials',
      });
    }
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
