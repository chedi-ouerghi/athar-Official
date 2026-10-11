import { parseEnvironment } from './environment.schema.js';
import type { AppConfig } from './app-config.js';
import { createAppConfig } from './app-config.js';
import { readPackageVersion } from '../common/package-version.js';

/** Dotenv files are applied in this order; earlier files win. */
const DOTENV_FILES = ['.env.local', '.env'] as const;

/**
 * Load `.env` files into `process.env` without overriding variables that are
 * already set, so real environment variables always take precedence.
 *
 * A missing file is not an error: production deployments inject real
 * environment variables instead of shipping `.env` files.
 */
async function loadDotEnvFiles(): Promise<void> {
  const { default: dotenv } = await import('dotenv');

  for (const file of DOTENV_FILES) {
    dotenv.config({ path: file, quiet: true });
  }
}

/**
 * Build the application configuration from `.env` files and `process.env`.
 *
 * Throws {@link import('./environment.schema').EnvironmentValidationError} when
 * the resulting environment is invalid, so the process refuses to start with a
 * bad configuration.
 */
export async function loadAppConfig(): Promise<AppConfig> {
  await loadDotEnvFiles();

  const environment = parseEnvironment(process.env);

  return createAppConfig(environment, readPackageVersion());
}
