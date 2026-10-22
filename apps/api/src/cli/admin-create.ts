/**
 * `pnpm --filter @athar/api admin:create --email <email> --name <text> [--password-stdin]`
 *
 * Creates an admin account (decision D8). The password is typed at a hidden
 * prompt (twice), or read from standard input with `--password-stdin`; it is
 * never accepted as an argument, where it would land in the shell history and
 * the process list.
 *
 * It writes the accounts file, so it takes the writer lock: while the API is
 * running this command refuses, rather than silently losing a change.
 */

import { Logger } from '@nestjs/common';
import { accountDisplayNameSchema, adminPasswordSchema, emailSchema } from '@athar/contracts';
import { AccountAlreadyExistsError, AccountRepository } from '../auth/account.repository.js';
import { AccountsService } from '../auth/accounts.service.js';
import { safeEqual, sha256 } from '../auth/token.js';
import type { AppConfig } from '../config/app-config.js';
import { loadAppConfig } from '../config/load-app-config.js';
import { EnvironmentValidationError } from '../config/environment.schema.js';
import { StartupConfigurationError } from '../config/startup-configuration.error.js';
import { systemClock } from '../device/clock.js';
import { CliUsageError, isEntryPoint, processIo, type CliIo } from './cli-io.js';

export const ADMIN_CREATE_USAGE = `Usage: admin:create --email <email> --name <displayName> [--password-stdin]

Creates an admin account that can sign in at once.

  --email <email>     the admin's email, used to sign in
  --name <text>       display name (1 to 100 characters)
  --password-stdin    read the password from standard input instead of a prompt

The password (14 to 200 characters) is never taken as an argument.
The API must not be running: it holds the accounts file open for writing.`;

export interface AdminCreateArguments {
  readonly email: string;
  readonly displayName: string;
  readonly passwordStdin: boolean;
}

export function parseAdminCreateArguments(argv: readonly string[]): AdminCreateArguments {
  let email: string | undefined;
  let displayName: string | undefined;
  let passwordStdin = false;

  const valueOf = (index: number, option: string): string => {
    const value = argv[index + 1];

    if (value === undefined || value.startsWith('--')) {
      throw new CliUsageError(`${option} needs a value.`);
    }

    return value;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index] as string;

    if (argument === '--email') {
      email = valueOf(index, argument);
      index += 1;
    } else if (argument === '--name') {
      displayName = valueOf(index, argument);
      index += 1;
    } else if (argument === '--password-stdin') {
      passwordStdin = true;
    } else {
      // Deliberately no --password: say why, without repeating what followed it.
      throw new CliUsageError(
        argument.startsWith('--password')
          ? 'The password is never taken as an argument; use the prompt or --password-stdin.'
          : argument.startsWith('--')
            ? `Unknown option ${argument}.`
            : 'Unexpected argument.',
      );
    }
  }

  const parsedEmail = emailSchema.safeParse(email);
  const parsedName = accountDisplayNameSchema.safeParse(displayName);

  if (!parsedEmail.success) {
    throw new CliUsageError('Invalid admin: --email must be an email address.');
  }

  if (!parsedName.success) {
    throw new CliUsageError('Invalid admin: --name must be 1 to 100 characters.');
  }

  return { email: parsedEmail.data, displayName: parsedName.data, passwordStdin };
}

export interface AdminCreateDependencies {
  readonly config: Pick<AppConfig, 'accountsDataFile'>;
  readonly io: CliIo;
  /** Reads the password: from stdin, or a hidden prompt. */
  readonly readPassword: (fromStdin: boolean) => Promise<string>;
  /** Opens the account store for writing. Defaults to the JSON file. */
  readonly openRepository?: (file: string) => Promise<AccountRepository>;
}

/** Run the command. Returns the process exit code. */
export async function runAdminCreate(
  argv: readonly string[],
  dependencies: AdminCreateDependencies,
): Promise<number> {
  const { config, io } = dependencies;

  try {
    if (argv.includes('--help') || argv.includes('-h')) {
      io.out(ADMIN_CREATE_USAGE);
      return 0;
    }

    const input = parseAdminCreateArguments(argv);
    const open = dependencies.openRepository ?? ((file: string) => AccountRepository.open(file));
    // Opened before asking for the password, so a running API is reported first.
    const repository = await open(config.accountsDataFile);

    try {
      const password = await dependencies.readPassword(input.passwordStdin);

      if (!adminPasswordSchema.safeParse(password).success) {
        throw new CliUsageError('The password must be 14 to 200 characters.', 1);
      }

      const account = await new AccountsService(repository, systemClock).createAdmin({
        ...input,
        password,
      });

      io.out(`Created admin ${account.email} (${account.id})`);

      return 0;
    } finally {
      await repository.close();
    }
  } catch (error) {
    if (error instanceof CliUsageError) {
      io.err(error.message);

      if (error.exitCode === 2) {
        io.err(ADMIN_CREATE_USAGE);
      }

      return error.exitCode;
    }

    if (error instanceof AccountAlreadyExistsError || error instanceof StartupConfigurationError) {
      io.err(error.message);
      return 1;
    }

    throw error;
  }
}

/** All of standard input, without the final line break. */
async function readStdin(): Promise<string> {
  let text = '';

  for await (const chunk of process.stdin) {
    text += String(chunk);
  }

  return text.replace(/\r?\n$/, '');
}

/** One line typed at the terminal with echo off. */
function promptHidden(question: string): Promise<string> {
  const { stdin, stdout } = process;

  if (!stdin.isTTY) {
    return Promise.reject(
      new CliUsageError('No terminal to prompt on; pipe the password in with --password-stdin.', 1),
    );
  }

  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (outcome: () => void) => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
      outcome();
    };
    const onData = (chunk: Buffer) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\r' || character === '\n') {
          finish(() => resolve(value));
          return;
        }

        if (character === '\u0003') {
          finish(() => reject(new CliUsageError('Cancelled.', 1)));
          return;
        }

        value =
          character === '\u007f' || character === '\b' ? value.slice(0, -1) : value + character;
      }
    };

    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

async function readPassword(fromStdin: boolean): Promise<string> {
  if (fromStdin) {
    return readStdin();
  }

  const password = await promptHidden('Password: ');
  const again = await promptHidden('Repeat it: ');

  if (!safeEqual(sha256(password), sha256(again))) {
    throw new CliUsageError('The two passwords differ.', 1);
  }

  return password;
}

async function main(): Promise<void> {
  // The command reports through its own output; Nest's log lines are noise here.
  Logger.overrideLogger(false);

  try {
    const config = await loadAppConfig();

    process.exitCode = await runAdminCreate(process.argv.slice(2), {
      config,
      io: processIo,
      readPassword,
    });
  } catch (error) {
    processIo.err(
      error instanceof EnvironmentValidationError || error instanceof StartupConfigurationError
        ? error.message
        : `admin:create failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

if (isEntryPoint(import.meta.url)) {
  void main();
}
