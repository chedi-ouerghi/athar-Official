/**
 * Application bootstrap.
 *
 * Separated from `main.ts` so integration tests can create a fully configured
 * application without binding a real port or reading `.env` files.
 */

import { Logger, NotFoundException, RequestMethod, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { API_PREFIX } from '@athar/contracts';
import { AppModule } from './app.module.js';
import type { AppConfig } from './config/app-config.js';

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
export async function createConfiguredApp(config: AppConfig): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule.forRoot(config));

  app.enableShutdownHooks(['SIGINT', 'SIGTERM'], {
    // Terminate via `process.exit` so buffered asynchronous log writes (the
    // pino transport worker) are flushed before the process goes away.
    useProcessExit: true,
  });

  app.useBodyParser('json', { limit: MAX_JSON_BODY_SIZE });
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
export async function createApp(config: AppConfig): Promise<NestExpressApplication> {
  const app = await createConfiguredApp(config);

  await app.listen(config.port, config.host);

  return app;
}

/** Log the address the server actually bound to. */
export async function logStartupInfo(app: NestExpressApplication): Promise<void> {
  const logger = new Logger('Bootstrap');
  const url = await app.getUrl();

  logger.log(`${url} is accepting requests`);
  logger.log(`Liveness: ${url}/health  Readiness: ${url}/ready`);
}
