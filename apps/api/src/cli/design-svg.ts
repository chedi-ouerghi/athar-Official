/**
 * `pnpm --filter @athar/api designs:svg [--out <dir>]`
 *
 * Renders every design's trajectory to an SVG so the artwork can be reviewed by
 * eye: one file per design (`<slug>.svg`) and `contact-sheet.svg` with all of
 * them together. The collection is validated first, so nothing is drawn from a
 * design that would not be allowed to start.
 */

import { Logger } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { designCollectionV1 } from '../designs/data/designs.v1.js';
import { DesignCollectionError, loadDesignCollection } from '../designs/design-collection.js';
import { renderContactSheet, renderDesignSvg } from '../designs/design-svg.js';
import { CliUsageError, isEntryPoint, processIo, type CliIo } from './cli-io.js';

export const DEFAULT_PREVIEW_DIRECTORY = './design-previews';

export const DESIGN_SVG_USAGE = `Usage: designs:svg [--out <directory>]

Writes <slug>.svg for each design, and contact-sheet.svg with all of them.

  --out <dir>   where to write the files (default ${DEFAULT_PREVIEW_DIRECTORY})`;

/** Parse the command line. @throws CliUsageError */
export function parseDesignSvgArguments(argv: readonly string[]): { outputDirectory: string } {
  let outputDirectory = DEFAULT_PREVIEW_DIRECTORY;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;

    if (argument === '--out') {
      const value = argv[index + 1];

      if (value === undefined || value.startsWith('--')) {
        throw new CliUsageError('--out needs a directory.');
      }

      outputDirectory = value;
      index += 1;
    } else {
      throw new CliUsageError(
        argument.startsWith('--')
          ? `Unknown option ${argument}.`
          : `Unexpected argument ${argument}.`,
      );
    }
  }

  return { outputDirectory };
}

/** Run the command. Returns the process exit code. */
export async function runDesignSvg(argv: readonly string[], io: CliIo): Promise<number> {
  try {
    if (argv.includes('--help') || argv.includes('-h')) {
      io.out(DESIGN_SVG_USAGE);
      return 0;
    }

    const { outputDirectory } = parseDesignSvgArguments(argv);
    const collection = loadDesignCollection(designCollectionV1);
    const directory = resolve(outputDirectory);

    await mkdir(directory, { recursive: true });

    for (const design of collection.designs) {
      const file = join(directory, `${design.slug}.svg`);

      await writeFile(file, renderDesignSvg(design.trajectory, design.title.en), 'utf8');
      io.out(`${design.slug.padEnd(20)} ${design.trajectory.points.length} points  ${file}`);
    }

    const sheet = join(directory, 'contact-sheet.svg');

    await writeFile(
      sheet,
      renderContactSheet(
        collection.designs.map((design) => ({
          title: design.title.en,
          trajectory: design.trajectory,
        })),
      ),
      'utf8',
    );
    io.out(`${'contact-sheet'.padEnd(20)} all designs  ${sheet}`);

    return 0;
  } catch (error) {
    if (error instanceof CliUsageError) {
      io.err(error.message);
      io.err(DESIGN_SVG_USAGE);
      return error.exitCode;
    }

    if (error instanceof DesignCollectionError) {
      io.err(error.message);
      return 1;
    }

    throw error;
  }
}

async function main(): Promise<void> {
  Logger.overrideLogger(false);

  try {
    process.exitCode = await runDesignSvg(process.argv.slice(2), processIo);
  } catch (error) {
    processIo.err(`designs:svg failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (isEntryPoint(import.meta.url)) {
  void main();
}
