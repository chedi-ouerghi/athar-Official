import { pathToFileURL } from 'node:url';

/** Where a command writes its output. Replaceable, so tests can read it. */
export interface CliIo {
  out(text: string): void;
  err(text: string): void;
}

export const processIo: CliIo = {
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) => process.stderr.write(`${text}\n`),
};

/** Why a command ended without doing its job, and how it should exit. */
export class CliUsageError extends Error {
  constructor(
    message: string,
    /** 2 for a mistake in how the command was called, 1 for anything else. */
    readonly exitCode: 1 | 2 = 2,
  ) {
    super(message);
    this.name = 'CliUsageError';
  }
}

/**
 * Whether this module is the program being run, rather than being imported by a
 * test. Lets a command file export its logic and still work as a script.
 */
export function isEntryPoint(moduleUrl: string): boolean {
  const entry = process.argv[1];

  return entry !== undefined && pathToFileURL(entry).href === moduleUrl;
}
