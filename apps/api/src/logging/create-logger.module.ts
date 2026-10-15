/**
 * Builds the `nestjs-pino` logger module.
 *
 * A factory (rather than a static `@Module`) is used because the log
 * destination and level depend on validated configuration resolved before the
 * Nest container is created.
 */

import type { DynamicModule } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import type { LevelWithSilent } from 'pino';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { AppConfig } from '../config/app-config.js';

/**
 * Header carrying a caller-supplied correlation id. When present it is reused
 * so a single request can be followed across services.
 */
const REQUEST_ID_HEADER = 'x-request-id';

/** Auth body fields that are secrets: a password, a token or an activation code. */
const SECRET_FIELDS = ['password', 'refreshToken', 'accessToken', 'activationCode'];

/**
 * Fields whose values must never reach the log stream: credentials in headers,
 * and auth secrets in a request body or any object logged by mistake.
 *
 * Redaction is applied by pino itself, so a value cannot leak through a custom
 * serialiser or a log transport.
 */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  `req.headers["${REQUEST_ID_HEADER}"]`,
  'res.headers["set-cookie"]',
  ...SECRET_FIELDS.flatMap((field) => [field, `*.${field}`, `req.body.${field}`]),
];

/** Placeholder written in place of a redacted value. */
const REDACTION_PLACEHOLDER = '[redacted]';

/** Paths excluded from automatic request logging, to avoid probe noise. */
const QUIET_PATHS = new Set(['/health', '/ready']);

/** Upper bound on an accepted inbound correlation id. */
const MAX_REQUEST_ID_LENGTH = 128;

/**
 * Read an inbound correlation id, if the caller supplied a usable one.
 */
function readIncomingRequestId(request: IncomingMessage): string | undefined {
  const header = request.headers[REQUEST_ID_HEADER];
  const value = Array.isArray(header) ? header[0] : header;

  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 && trimmed.length <= MAX_REQUEST_ID_LENGTH ? trimmed : undefined;
}

/** `pino-pretty` settings used only in development. */
const PRETTY_TRANSPORT = {
  target: 'pino-pretty',
  options: {
    colorize: true,
    singleLine: false,
    translateTime: 'HH:MM:ss.l',
    ignore: 'pid,hostname,service,serviceVersion',
  },
};

/**
 * Create the logger module for the given configuration.
 *
 * In development logs are piped through `pino-pretty` for readability; in
 * every other environment plain newline-delimited JSON is emitted, which is
 * what log shippers expect. `pino-pretty` is a dev dependency and is
 * therefore never loaded in a production install.
 */
export function createLoggerModule(config: AppConfig): DynamicModule {
  return LoggerModule.forRoot({
    pinoHttp: {
      name: config.serviceName,
      // The `satisfies` keeps the level tied to pino's own union even though
      // `pinoHttp` re-exports it through `pino-http`'s conditional options type.
      level: config.logLevel satisfies LevelWithSilent,
      base: {
        service: config.serviceName,
        serviceVersion: config.serviceVersion,
      },
      redact: {
        paths: REDACTED_PATHS,
        censor: REDACTION_PLACEHOLDER,
      },
      genReqId: (request) => readIncomingRequestId(request) ?? randomUUID(),
      autoLogging: {
        ignore: (request) => QUIET_PATHS.has(request.url ?? ''),
      },
      transport: config.nodeEnv === 'development' ? PRETTY_TRANSPORT : undefined,
    },
  });
}
