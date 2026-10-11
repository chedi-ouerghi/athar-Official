/**
 * `pnpm --filter @athar/api table:create --name <text> --location <text> [--disabled]`
 *
 * Registers a table through the same `TableRegistry` the admin endpoint uses, so
 * a table made here and one made over HTTP are created by the same code, with the
 * same validation and the same server-generated id.
 *
 * It writes the tables file, so it takes the writer lock. While the API is
 * running it holds that lock and this command refuses to run, rather than
 * silently losing a change; stop the API first, or use the admin endpoint.
 */

import { Logger } from '@nestjs/common';
import { createTableRequestSchema } from '@athar/contracts';
import type { AppConfig } from '../config/app-config.js';
import { loadAppConfig } from '../config/load-app-config.js';
import { EnvironmentValidationError } from '../config/environment.schema.js';
import { StartupConfigurationError } from '../config/startup-configuration.error.js';
import { systemClock } from '../device/clock.js';
import { JsonFileTableRepository } from '../tables/json-file-table.repository.js';
import { generateTableId } from '../tables/table-id.js';
import { buildTableLink } from '../tables/table-link.js';
import type { TableRepository } from '../tables/table-repository.js';
import { TableRegistry } from '../tables/table-registry.service.js';
import { CliUsageError, isEntryPoint, processIo, type CliIo } from './cli-io.js';

export const TABLE_CREATE_USAGE = `Usage: table:create --name <displayName> --location <location> [--disabled]

Registers a table and prints its generated id.

  --name <text>       display name shown in the app (1 to 100 characters)
  --location <text>   where the table is, e.g. a room or venue (1 to 200 characters)
  --disabled          register the table switched off (default: enabled)

The API must not be running: it holds the tables file open for writing.
To register a table while it runs, use POST /api/v1/admin/tables instead.`;

export interface TableCreateArguments {
  readonly displayName: string;
  readonly location: string;
  readonly enabled: boolean;
}

/** Parse and validate the command line, with the same schema the HTTP body uses. */
export function parseTableCreateArguments(argv: readonly string[]): TableCreateArguments {
  let displayName: string | undefined;
  let location: string | undefined;
  let enabled = true;

  const valueOf = (index: number, option: string): string => {
    const value = argv[index + 1];

    if (value === undefined || value.startsWith('--')) {
      throw new CliUsageError(`${option} needs a value.`);
    }

    return value;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;

    if (argument === '--name') {
      displayName = valueOf(index, argument);
      index += 1;
    } else if (argument === '--location') {
      location = valueOf(index, argument);
      index += 1;
    } else if (argument === '--disabled') {
      enabled = false;
    } else {
      throw new CliUsageError(
        argument.startsWith('--')
          ? `Unknown option ${argument}.`
          : `Unexpected argument ${argument}.`,
      );
    }
  }

  const parsed = createTableRequestSchema.safeParse({ displayName, location, enabled });

  if (!parsed.success) {
    const reasons = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(input)'}: ${issue.message}`)
      .join('; ');

    throw new CliUsageError(`Invalid table: ${reasons}.`);
  }

  return parsed.data;
}

export interface TableCreateDependencies {
  readonly config: Pick<AppConfig, 'publicLinkBaseUrl' | 'tablesDataFile'>;
  readonly io: CliIo;
  /** Opens the table store for writing. Defaults to the JSON file. */
  readonly openRepository?: (
    file: string,
  ) => Promise<TableRepository & { close?(): Promise<void> }>;
}

/** Run the command. Returns the process exit code. */
export async function runTableCreate(
  argv: readonly string[],
  dependencies: TableCreateDependencies,
): Promise<number> {
  const { config, io } = dependencies;

  try {
    if (argv.includes('--help') || argv.includes('-h')) {
      io.out(TABLE_CREATE_USAGE);
      return 0;
    }

    const input = parseTableCreateArguments(argv);
    const open =
      dependencies.openRepository ?? ((file: string) => JsonFileTableRepository.open(file));
    const repository = await open(config.tablesDataFile);

    try {
      const registry = new TableRegistry(repository, config, systemClock, generateTableId);
      const table = await registry.create(input);

      io.out(`Registered table ${table.id}`);
      io.out(`  name:      ${table.displayName}`);
      io.out(`  location:  ${table.location}`);
      io.out(`  enabled:   ${String(table.enabled)}`);
      io.out(`  link:      ${buildTableLink(config.publicLinkBaseUrl, table.id)}`);
      io.out('');
      io.out(`Next: pnpm --filter @athar/api table:qr ${table.id}`);

      return 0;
    } finally {
      await repository.close?.();
    }
  } catch (error) {
    if (error instanceof CliUsageError) {
      io.err(error.message);

      if (error.exitCode === 2) {
        io.err(TABLE_CREATE_USAGE);
      }

      return error.exitCode;
    }

    if (error instanceof StartupConfigurationError) {
      io.err(error.message);
      return 1;
    }

    throw error;
  }
}

async function main(): Promise<void> {
  // The command reports through its own output; Nest's log lines are noise here.
  Logger.overrideLogger(false);

  try {
    const config = await loadAppConfig();

    process.exitCode = await runTableCreate(process.argv.slice(2), { config, io: processIo });
  } catch (error) {
    processIo.err(
      error instanceof EnvironmentValidationError || error instanceof StartupConfigurationError
        ? error.message
        : `table:create failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

if (isEntryPoint(import.meta.url)) {
  void main();
}
