/**
 * `pnpm --filter @athar/api table:qr <tableId> [--out <dir>] [--no-verify]`
 *
 * Writes the QR code for a table as an SVG and a PNG. The code encodes
 * `<PUBLIC_LINK_BASE_URL>/t/<tableId>` and nothing else.
 *
 * It reads the tables file read-only and takes no lock, so it is safe to run
 * while the API is running.
 */

import { Logger } from '@nestjs/common';
import { tableIdSchema } from '@athar/contracts';
import { resolve } from 'node:path';
import type { AppConfig } from '../config/app-config.js';
import { loadAppConfig } from '../config/load-app-config.js';
import { EnvironmentValidationError } from '../config/environment.schema.js';
import { StartupConfigurationError } from '../config/startup-configuration.error.js';
import { JsonFileTableRepository } from '../tables/json-file-table.repository.js';
import { buildTableLink } from '../tables/table-link.js';
import type { TableRepository } from '../tables/table-repository.js';
import { CliUsageError, isEntryPoint, processIo, type CliIo } from './cli-io.js';
import { writeQrFiles } from './qr-files.js';

export const DEFAULT_OUTPUT_DIRECTORY = './qr-codes';

export const TABLE_QR_USAGE = `Usage: table:qr <tableId> [--out <directory>] [--no-verify]

Writes <tableId>.svg and <tableId>.png, a QR code for the table's link.

  <tableId>        the public id of a registered table
  --out <dir>      where to write the files (default ${DEFAULT_OUTPUT_DIRECTORY})
  --no-verify      do not check that the table exists in TABLES_DATA_FILE`;

export interface TableQrArguments {
  readonly tableId: string;
  readonly outputDirectory: string;
  readonly verify: boolean;
}

/** Parse the command line. @throws CliUsageError */
export function parseTableQrArguments(argv: readonly string[]): TableQrArguments {
  let tableId: string | undefined;
  let outputDirectory = DEFAULT_OUTPUT_DIRECTORY;
  let verify = true;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;

    if (argument === '--no-verify') {
      verify = false;
    } else if (argument === '--out') {
      const value = argv[index + 1];

      if (value === undefined || value.startsWith('--')) {
        throw new CliUsageError('--out needs a directory.');
      }

      outputDirectory = value;
      index += 1;
    } else if (argument.startsWith('--')) {
      throw new CliUsageError(`Unknown option ${argument}.`);
    } else if (tableId === undefined) {
      tableId = argument;
    } else {
      throw new CliUsageError(`Unexpected argument ${argument}.`);
    }
  }

  if (tableId === undefined) {
    throw new CliUsageError('A table id is required.');
  }

  if (!tableIdSchema.safeParse(tableId).success) {
    throw new CliUsageError(
      `"${tableId}" is not a valid table id: use 3 to 40 lowercase letters, digits or hyphens.`,
    );
  }

  return { tableId, outputDirectory, verify };
}

export interface TableQrDependencies {
  readonly config: Pick<AppConfig, 'publicLinkBaseUrl' | 'tablesDataFile'>;
  readonly io: CliIo;
  /** Opens the table list for reading. Defaults to the JSON file, read-only. */
  readonly openRepository?: (file: string) => Promise<TableRepository>;
}

/** Run the command. Returns the process exit code. */
export async function runTableQr(
  argv: readonly string[],
  dependencies: TableQrDependencies,
): Promise<number> {
  const { config, io } = dependencies;

  try {
    if (argv.includes('--help') || argv.includes('-h')) {
      io.out(TABLE_QR_USAGE);
      return 0;
    }

    const { tableId, outputDirectory, verify } = parseTableQrArguments(argv);

    if (verify) {
      const open =
        dependencies.openRepository ??
        ((file: string) => JsonFileTableRepository.open(file, { readOnly: true }));
      const table = await (await open(config.tablesDataFile)).get(tableId);

      if (table === undefined) {
        throw new CliUsageError(
          `No table with id ${tableId} in ${config.tablesDataFile}. Register it first, or pass --no-verify to generate the code anyway.`,
          1,
        );
      }

      if (!table.enabled) {
        io.err(`Note: table ${tableId} is currently disabled.`);
      }
    }

    const link = buildTableLink(config.publicLinkBaseUrl, tableId);
    const files = await writeQrFiles(link, tableId, resolve(outputDirectory));

    io.out(`Link: ${link}`);
    io.out(`SVG:  ${files.svgPath}`);
    io.out(`PNG:  ${files.pngPath} (${files.pngPixels} x ${files.pngPixels} px)`);

    if (config.publicLinkBaseUrl === undefined) {
      io.err(
        'Note: PUBLIC_LINK_BASE_URL is not set, so this code holds a development link (athar://...) that only opens the app. Set it before printing codes for real tables.',
      );
    }

    return 0;
  } catch (error) {
    if (error instanceof CliUsageError) {
      io.err(error.message);

      if (error.exitCode === 2) {
        io.err(TABLE_QR_USAGE);
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

    process.exitCode = await runTableQr(process.argv.slice(2), { config, io: processIo });
  } catch (error) {
    processIo.err(
      error instanceof EnvironmentValidationError || error instanceof StartupConfigurationError
        ? error.message
        : `table:qr failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

if (isEntryPoint(import.meta.url)) {
  void main();
}
