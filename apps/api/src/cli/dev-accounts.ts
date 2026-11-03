/**
 * Development only: `pnpm --filter @athar/api dev:accounts [--table <id>]`
 *
 * Creates (or resets) two test accounts that can sign in at once, and links both
 * to one table so the mobile app can drive it:
 *
 * - user@athar.test  (customer) becomes the table's owner.
 * - admin@athar.test (admin)    gets guest access to it, so it can use the table
 *                               too (an admin alone may only read tables).
 *
 * The table is registered with that exact id if it is missing (default: the
 * Raspberry Pi's id, lf334xjjycrwlot3). Running it again gives both accounts new
 * passwords. The passwords are printed once and stored only as hashes.
 *
 * It writes the accounts, tables and access files, so the API must be stopped.
 */

import { Logger } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { DEFAULT_TABLE_GEOMETRY, tableIdSchema } from '@athar/contracts';
import { TableAccessRepository } from '../access/access.repository.js';
import { AccountRepository, type AccountRecord } from '../auth/account.repository.js';
import { hashPassword } from '../auth/password-hasher.js';
import { loadAppConfig } from '../config/load-app-config.js';
import { JsonFileTableRepository } from '../tables/json-file-table.repository.js';
import { isEntryPoint, processIo } from './cli-io.js';

const DEFAULT_TABLE_ID = 'lf334xjjycrwlot3';
const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60_000;

/** 20 characters: long enough for an admin (14+) and a customer (10+). */
const newPassword = () => `Athar-${randomBytes(10).toString('base64url').slice(0, 14)}`;

async function upsertAccount(
  accounts: AccountRepository,
  input: Pick<AccountRecord, 'email' | 'displayName' | 'role'>,
  password: string,
): Promise<AccountRecord> {
  const now = new Date().toISOString();
  const passwordHash = await hashPassword(password);
  const existing = await accounts.findByEmail(input.email);
  const secrets = { passwordHash, activationCodeHash: null, activationExpiresAt: null };

  if (existing !== undefined) {
    const updated = await accounts.update(existing.id, (account) => ({
      ...account,
      ...input,
      ...secrets,
      disabled: false,
      updatedAt: now,
    }));

    return updated as AccountRecord;
  }

  const record: AccountRecord = {
    id: randomUUID(),
    ...input,
    ...secrets,
    disabled: false,
    createdAt: now,
    updatedAt: now,
  };

  await accounts.create(record);

  return record;
}

async function main(): Promise<void> {
  Logger.overrideLogger(false);

  const argv = process.argv.slice(2);
  const tableFlag = argv.indexOf('--table');
  const config = await loadAppConfig();
  // --table wins, then TABLE_ID from the .env (loaded by loadAppConfig), then the old default.
  const tableId = tableIdSchema.parse(
    tableFlag === -1 ? process.env.TABLE_ID || DEFAULT_TABLE_ID : argv[tableFlag + 1],
  );

  // Each open takes that file's writer lock and fails if the API is running.
  const accounts = await AccountRepository.open(config.accountsDataFile);
  const tables = await JsonFileTableRepository.open(config.tablesDataFile);
  const access = await TableAccessRepository.open(config.tableAccessDataFile);

  try {
    const adminPassword = newPassword();
    const userPassword = newPassword();

    const admin = await upsertAccount(
      accounts,
      { email: 'admin@athar.test', displayName: 'Admin test', role: 'admin' },
      adminPassword,
    );
    const user = await upsertAccount(
      accounts,
      { email: 'user@athar.test', displayName: 'User test', role: 'customer' },
      userPassword,
    );

    const now = new Date();

    if ((await tables.get(tableId)) === undefined) {
      await tables.create({
        id: tableId,
        displayName: 'Table Pi 5',
        location: 'Lab',
        enabled: true,
        ownerAccountId: user.id,
        reservedForAccountId: null,
        plan: 'personalized',
        voiceAssistant: false,
        geometry: DEFAULT_TABLE_GEOMETRY,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      });
    } else {
      await tables.update(tableId, {
        ownerAccountId: user.id,
        reservedForAccountId: null,
        enabled: true,
        updatedAt: now.toISOString(),
      });
    }

    await access.grantGuest(
      {
        kind: 'guest',
        tableId,
        accountId: admin.id,
        since: now.toISOString(),
        expiresAt: new Date(now.getTime() + TEN_YEARS_MS).toISOString(),
        viaTokenId: randomUUID(),
      },
      now.getTime(),
    );

    processIo.out(
      [
        '',
        `Table ${tableId} is ready.`,
        '',
        'ADMIN  (guest access to the table)',
        `  email    : ${admin.email}`,
        `  password : ${adminPassword}`,
        '',
        'USER   (owner of the table)',
        `  email    : ${user.email}`,
        `  password : ${userPassword}`,
        '',
        'Start the API again, then sign in on the mobile app.',
        '',
      ].join('\n'),
    );
  } finally {
    await access.close();
    await tables.close();
    await accounts.close();
  }
}

if (isEntryPoint(import.meta.url)) {
  main().catch((error: unknown) => {
    processIo.err(`dev:accounts failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
