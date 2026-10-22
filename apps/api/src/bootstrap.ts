/**
 * Application bootstrap.
 *
 * Separated from `main.ts` so integration tests can create a fully configured
 * application without binding a real port or reading `.env` files.
 */

import { Logger, NotFoundException, RequestMethod, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger as PinoLogger } from 'nestjs-pino';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { API_PREFIX } from '@athar/contracts';
import { AppModule } from './app.module.js';
import type { AppConfig } from './config/app-config.js';
import { AccountRepository } from './auth/account.repository.js';
import { SessionRepository } from './auth/session.repository.js';
import { TableAccessRepository } from './access/access.repository.js';
import { JsonFileTableRepository } from './tables/json-file-table.repository.js';
import type { AppModuleOptions } from './app.module.js';

/**
 * Largest accepted JSON request body.
 *
 * The API currently exchanges only small control-plane payloads; anything
 * substantially larger is a client mistake and is rejected early rather than
 * buffered into memory.
 */
const MAX_JSON_BODY_SIZE = '100kb';

/**
 * Operational probes stay at the root of the service (`/health`, `/ready`)
 * because orchestrators and uptime monitors address them by a fixed path.
 *
 * Everything else is mounted under the global prefix and versioned, which puts
 * business endpoints at `/api/v1/...`.
 */
const UNPREFIXED_PROBES = [
  { path: 'health', method: RequestMethod.GET },
  { path: 'ready', method: RequestMethod.GET },
] as const;

/** Version applied to controllers that do not declare one explicitly. */
const DEFAULT_API_VERSION = '1';

/** Request shape read by the root catch-all below. */
interface CatchAllRequest {
  method?: string;
  originalUrl?: string;
}

/**
 * Minimal structural view of the underlying Express application.
 */
interface HttpServerApplication {
  use(
    handler: (request: CatchAllRequest, response: unknown, next: (error?: Error) => void) => void,
  ): unknown;
}

/** Path prefixes served by this application. */
const API_PREFIXES = ['/api/', '/health', '/ready'];

/**
 * Reject, in the standard error shape, any path that is not part of the
 * service's surface.
 *
 * Nest installs its own not-found handler *underneath* the global prefix, so a
 * request to a path outside `/api` would otherwise be answered by the web
 * server's default page — an HTML document with no correlation id, which
 * clients cannot parse.
 *
 * This guard has to be installed before `init()`, because that is when Nest
 * mounts the route table; middleware registered afterwards sits behind the
 * already-resolved pipeline.
 */
function registerRootNotFoundHandler(app: NestExpressApplication): void {
  const server = app.getHttpAdapter().getInstance() as HttpServerApplication;

  server.use((request, _response, next) => {
    const path = request.originalUrl ?? '';

    if (API_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      next();
      return;
    }

    next(new NotFoundException(`Cannot ${request.method ?? 'REQUEST'} ${path || 'unknown'}`));
  });
}

/**
 * Instantiate the Nest application and apply every cross-cutting HTTP concern.
 *
 * The returned instance is initialised but not yet listening.
 */
export async function createConfiguredApp(
  config: AppConfig,
  overrides: Partial<AppModuleOptions> = {},
): Promise<NestExpressApplication> {
  // The data files are opened (and validated) before Nest starts, so a corrupt
  // file stops the process with a readable message instead of a Nest init
  // failure. Tests pass repositories of their own and never touch the disk.
  const owned: { close(): Promise<void> }[] = [];
  const own = async <T extends { close(): Promise<void> }>(opening: Promise<T>): Promise<T> => {
    const repository = await opening;
    owned.push(repository);
    return repository;
  };

  try {
    return await buildApp(config, {
      ...overrides,
      repository:
        overrides.repository ?? (await own(JsonFileTableRepository.open(config.tablesDataFile))),
      accounts: overrides.accounts ?? (await own(AccountRepository.open(config.accountsDataFile))),
      sessions: overrides.sessions ?? (await own(SessionRepository.open(config.sessionsDataFile))),
      access:
        overrides.access ?? (await own(TableAccessRepository.open(config.tableAccessDataFile))),
    });
  } catch (error) {
    // The application never came up, so nothing else will release the file locks.
    await Promise.all(owned.map((repository) => repository.close()));
    throw error;
  }
}

async function buildApp(
  config: AppConfig,
  options: AppModuleOptions,
): Promise<NestExpressApplication> {
  // `bufferLogs` holds everything Nest logs while the container is being built
  // and replays it through pino once `useLogger` installs it, so no line (not
  // even "Starting Nest application...") escapes as unformatted text. From then
  // on every `new Logger(...)` in the codebase writes through pino, which
  // makes LOG_LEVEL, redaction and JSON output apply to application logs too.
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config, options), {
    bufferLogs: true,
  });
  app.useLogger(app.get(PinoLogger));

  app.enableShutdownHooks(['SIGINT', 'SIGTERM'], {
    // Terminate via `process.exit` so buffered asynchronous log writes (the
    // pino transport worker) are flushed before the process goes away.
    useProcessExit: true,
  });

  app.useBodyParser('json', { limit: MAX_JSON_BODY_SIZE });

  // `req.ip`, which the sign-in throttle keys on, comes from X-Forwarded-For only
  // through the proxies TRUST_PROXY names; otherwise it is the socket's address.
  if (config.trustProxy !== undefined) {
    app.set('trust proxy', config.trustProxy);
  }
  // Browsers (Expo web) need CORS; the native app does not. Bearer tokens, no cookies.
  const origins: (string | RegExp)[] = [...config.corsOrigins];
  if (origins.length === 0 && config.nodeEnv === 'development') {
    origins.push(/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/);
  }
  if (origins.length > 0) {
    app.enableCors({ origin: origins, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] });
  }

  app.setGlobalPrefix(API_PREFIX, { exclude: [...UNPREFIXED_PROBES] });
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: DEFAULT_API_VERSION,
  });

  registerRootNotFoundHandler(app);

  await app.init();

  return app;
}

/**
 * Create and start the HTTP application.
 *
 * The returned instance is listening; the caller owns shutting it down.
 */
export async function createApp(
  config: AppConfig,
  overrides: Partial<AppModuleOptions> = {},
): Promise<NestExpressApplication> {
  const app = await createConfiguredApp(config, overrides);

  try {
    await app.listen(config.port, config.host);
  } catch (error) {
    // The caller never receives the app (the port is taken, say), so close it
    // here: that releases the data file locks. A failed close must not hide why
    // listening failed.
    await app.close().catch((closeError: unknown) => {
      new Logger('Bootstrap').warn(
        `Could not close the application after it failed to listen: ${closeError instanceof Error ? closeError.message : String(closeError)}`,
      );
    });
    throw error;
  }

  return app;
}

/** Log the address the server actually bound to. */
export async function logStartupInfo(app: NestExpressApplication): Promise<void> {
  const logger = new Logger('Bootstrap');
  const url = await app.getUrl();

  logger.log(`${url} is accepting requests`);
  logger.log(`Liveness: ${url}/health  Readiness: ${url}/ready`);
}
