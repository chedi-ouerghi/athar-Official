/**
 * Accounts, persisted in `ACCOUNTS_DATA_FILE` through the same JSON-file store
 * as tables (decision D10), or held in memory for tests. One class over either
 * store, so the two cannot drift.
 *
 * A record holds hashes only: never a password or an activation code.
 */

import { z } from 'zod';
import { accountRoleSchema } from '@athar/contracts';
import {
  JsonFileStore,
  MemoryStore,
  type RecordStore,
} from '../common/persistence/json-file-store.js';

export const ACCOUNTS_FILE_VERSION = 1;

export const accountRecordSchema = z.object({
  id: z.string().min(1),
  /** Lowercased; unique. */
  email: z.string().min(1),
  displayName: z.string(),
  role: accountRoleSchema,
  /** `null` until the account is activated. */
  passwordHash: z.string().nullable(),
  activationCodeHash: z.string().nullable(),
  activationExpiresAt: z.string().nullable(),
  disabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AccountRecord = z.infer<typeof accountRecordSchema>;

const accountsSchema = z.array(accountRecordSchema).superRefine((accounts, context) => {
  for (const field of ['id', 'email'] as const) {
    const seen = new Set<string>();

    for (const [index, account] of accounts.entries()) {
      if (seen.has(account[field])) {
        context.addIssue({
          code: 'custom',
          path: [index, field],
          message: `duplicate account ${field}`,
        });
      }

      seen.add(account[field]);
    }
  }
});

export class AccountAlreadyExistsError extends Error {
  constructor() {
    super('An account with this email already exists.');
    this.name = 'AccountAlreadyExistsError';
  }
}

export class AccountRepository {
  private constructor(private readonly store: RecordStore<AccountRecord>) {}

  static inMemory(seed: readonly AccountRecord[] = []): AccountRepository {
    return new AccountRepository(new MemoryStore(seed));
  }

  /** @throws StartupConfigurationError, as for the tables file. */
  static async open(file: string): Promise<AccountRepository> {
    return new AccountRepository(
      await JsonFileStore.open(file, {
        setting: 'ACCOUNTS_DATA_FILE',
        key: 'accounts',
        version: ACCOUNTS_FILE_VERSION,
        schema: accountsSchema,
        busyHint:
          'Only one process may write the accounts file at a time: stop the API before running a command that changes accounts.',
      }),
    );
  }

  close(): Promise<void> {
    return this.store.close();
  }

  /** Nest calls this when the application closes. */
  onModuleDestroy(): Promise<void> {
    return this.close();
  }

  get(id: string): Promise<AccountRecord | undefined> {
    return Promise.resolve(this.store.records.find((account) => account.id === id));
  }

  /** @param email - Already lowercased (the request schemas do it). */
  findByEmail(email: string): Promise<AccountRecord | undefined> {
    return Promise.resolve(this.store.records.find((account) => account.email === email));
  }

  /** @throws AccountAlreadyExistsError if the email is taken. */
  create(record: AccountRecord): Promise<void> {
    return this.store.change((accounts) => {
      if (accounts.some((account) => account.email === record.email)) {
        throw new AccountAlreadyExistsError();
      }

      return { next: [...accounts, record], result: undefined };
    });
  }

  /**
   * Replace one account with what `change` makes of it, inside the write queue,
   * so a check made in `change` cannot race another write. `change` returning
   * `undefined` stores nothing. Resolves to the stored account, or `undefined`.
   */
  update(
    id: string,
    change: (account: AccountRecord) => AccountRecord | undefined,
  ): Promise<AccountRecord | undefined> {
    return this.store.change((accounts) => {
      const existing = accounts.find((account) => account.id === id);
      const updated = existing === undefined ? undefined : change(existing);

      return updated === undefined
        ? { result: undefined }
        : {
            next: accounts.map((account) => (account.id === id ? updated : account)),
            result: updated,
          };
    });
  }
}
