import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { createApp, logStartupInfo } from './bootstrap.js';
import { loadAppConfig } from './config/load-app-config.js';
import { EnvironmentValidationError } from './config/environment.schema.js';
import { StartupConfigurationError } from './config/startup-configuration.error.js';

/**
 * Process entry point.
 *
 * Configuration is resolved before anything is bound, so a misconfigured
 * environment fails immediately with an actionable message instead of
 * surfacing later as a broken request.
 */
async function main(): Promise<void> {
  const config = await loadAppConfig();
  const app = await createApp(config);

  await logStartupInfo(app);
}

main().catch((error: unknown) => {
  const logger = new Logger('Main');

  if (error instanceof EnvironmentValidationError || error instanceof StartupConfigurationError) {
    // The operator needs the full message (every problem, or the exact setting
    // to change), so print it verbatim rather than a generic failure and stack.
    logger.error(error.message);
  } else {
    logger.error('Failed to start the API.', error instanceof Error ? error.stack : undefined);
  }

  process.exitCode = 1;
});
