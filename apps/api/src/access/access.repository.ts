/**
 * Who may use a table besides its owner, persisted in `TABLE_ACCESS_DATA_FILE`
 * (or held in memory for tests): the one-time **claim** tokens that make a
 * customer a table's owner, the **share** tokens an owner hands to guests, and
 * the **guests** who redeemed one.
 *
 * The owner itself stays in the table record (`ownerAccountId`), the single
 * source of truth; claiming a table is the service writing that field.
 *
 * A record holds token hashes only (SHA-256 of 256 random bits), never a token.
 * Every decision about a token (valid, used up, expired, revoked) and the effect
 * of redeeming it happen inside one `change`, which runs one at a time, so two
 * simultaneous redemptions of a single-use token cannot both succeed.
 *
 * shortcut: one JSON file and one writing process; the same interface can sit on
 * a database (a unique index on the token hash and on table + account).
 */

import { z } from 'zod';
import {
  JsonFileStore,
  MemoryStore,
  type RecordStore,
} from '../common/persistence/json-file-store.js';

export const TABLE_ACCESS_FILE_VERSION = 1;

const tokenFields = {
  /** The share id, for a share. */
  id: z.uuid(),
  tableId: z.string().min(1),
  /** Hex SHA-256 of the token. */
  tokenHash: z.string().regex(/^[0-9a-f]{64}$/),
  /** The owner who created a share; `null` for a claim token, which an admin issues. */
  createdBy: z.string().nullable(),
  createdAt: z.string(),
  expiresAt: z.string(),
  maxUses: z.number().int().min(1),
  usedCount: z.number().int().min(0),
  revokedAt: z.string().nullable(),
};

const claimRecordSchema = z.object({
  kind: z.literal('claim'),
  ...tokenFields,
  /**
   * The one account that may redeem it: a claim code is for one table and one
   * customer. `null` on a code issued before codes were bound to a customer, which
   * no account can redeem any more.
   */
  accountId: z.string().min(1).nullable().default(null),
});
const shareRecordSchema = z.object({ kind: z.literal('share'), ...tokenFields });
const guestRecordSchema = z.object({
  kind: z.literal('guest'),
  tableId: z.string().min(1),
  accountId: z.string().min(1),
  since: z.string(),
  /** The end of the link the guest redeemed. */
  expiresAt: z.string(),
  viaTokenId: z.uuid(),
});

export const accessRecordSchema = z.discriminatedUnion('kind', [
  claimRecordSchema,
  shareRecordSchema,
  guestRecordSchema,
]);
export type AccessRecord = z.infer<typeof accessRecordSchema>;
export type TokenRecord = z.infer<typeof claimRecordSchema> | z.infer<typeof shareRecordSchema>;
export type GuestRecord = z.infer<typeof guestRecordSchema>;

const guestKey = (tableId: string, accountId: string) => `${tableId} ${accountId}`;

const accessRecordsSchema = z.array(accessRecordSchema).superRefine((records, context) => {
  const hashes = new Set<string>();
  const guests = new Set<string>();

  for (const [index, record] of records.entries()) {
    const key = record.kind === 'guest' ? guestKey(record.tableId, record.accountId) : null;
    const seen = key === null ? hashes : guests;
    const value = key ?? (record as TokenRecord).tokenHash;

    if (seen.has(value)) {
      context.addIssue({ code: 'custom', path: [index], message: 'duplicate record' });
    }

    seen.add(value);
  }
});

/** What redeeming a token came to. */
export type RedeemOutcome =
  /** Unknown, for another table, revoked, used up or expired: one answer for all. */
  | { readonly outcome: 'invalid' }
  /** A valid claim token, but the table already has an owner. */
  | { readonly outcome: 'already-claimed' }
  /** A valid claim token for another customer's account. Nothing is spent. */
  | { readonly outcome: 'wrong-account' }
  /** The claim token is now used; the caller must make the account the owner. */
  | { readonly outcome: 'claimed'; readonly tokenId: string }
  | { readonly outcome: 'guest'; readonly tokenId: string; readonly expiresAt: string };

export interface RedeemInput {
  readonly tokenHash: string;
  readonly tableId: string;
  readonly accountId: string;
  /** Milliseconds since the epoch. */
  readonly now: number;
  /** Whether the table has no owner yet (a claim needs it, a share forbids it). */
  readonly ownerless: boolean;
}

interface Indexes {
  readonly from: readonly AccessRecord[];
  readonly byHash: ReadonlyMap<string, TokenRecord>;
  readonly guests: ReadonlyMap<string, GuestRecord>;
}

const isToken = (record: AccessRecord): record is TokenRecord => record.kind !== 'guest';
const isGuestRecord = (record: AccessRecord): record is GuestRecord => record.kind === 'guest';

/** Whether a token can still be redeemed at `now`. */
export function isLive(token: TokenRecord, now: number): boolean {
  return (
    token.revokedAt === null && token.usedCount < token.maxUses && Date.parse(token.expiresAt) > now
  );
}

const isUnexpired = (token: TokenRecord, now: number) =>
  token.revokedAt === null && Date.parse(token.expiresAt) > now;

/** Records still worth keeping at `now`: live tokens, and guests whose access has not ended. */
function isKept(record: AccessRecord, now: number): boolean {
  return isGuestRecord(record) ? Date.parse(record.expiresAt) > now : isLive(record, now);
}

function spend(records: readonly AccessRecord[], token: TokenRecord): AccessRecord[] {
  return records.map((record) =>
    record === token ? { ...token, usedCount: token.usedCount + 1 } : record,
  );
}

export class TableAccessRepository {
  private indexes: Indexes | undefined;

  private constructor(private readonly store: RecordStore<AccessRecord>) {}

  static inMemory(seed: readonly AccessRecord[] = []): TableAccessRepository {
    return new TableAccessRepository(new MemoryStore(seed));
  }

  /** @throws StartupConfigurationError, as for the tables file. */
  static async open(file: string): Promise<TableAccessRepository> {
    return new TableAccessRepository(
      await JsonFileStore.open(file, {
        setting: 'TABLE_ACCESS_DATA_FILE',
        key: 'access',
        version: TABLE_ACCESS_FILE_VERSION,
        schema: accessRecordsSchema,
        busyHint:
          'Only one process may write the table access file at a time: stop the API before starting another one.',
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

  list(): readonly AccessRecord[] {
    return this.store.records;
  }

  findTokenByHash(tokenHash: string): TokenRecord | undefined {
    return this.index().byHash.get(tokenHash);
  }

  /** Whether `accountId` holds a guest access to the table that has not ended by `now`. */
  isGuest(tableId: string, accountId: string, now: number): boolean {
    const guest = this.index().guests.get(guestKey(tableId, accountId));

    return guest !== undefined && Date.parse(guest.expiresAt) > now;
  }

  /**
   * Store a new token. Tokens that can no longer be redeemed, and guest accesses
   * that have ended, are dropped at the same time, so the file stays small.
   */
  insertToken(token: TokenRecord, now: number): Promise<void> {
    return this.store.change((records) => ({
      next: [...records.filter((record) => isKept(record, now)), token],
      result: undefined,
    }));
  }

  /**
   * Give an account guest access to a table directly, replacing any guest access
   * it already had there. Only dev tooling calls this; the app grants guests
   * through share links.
   */
  grantGuest(guest: GuestRecord, now: number): Promise<void> {
    const key = guestKey(guest.tableId, guest.accountId);

    return this.store.change((records) => ({
      next: [
        ...records.filter(
          (record) =>
            isKept(record, now) &&
            !(isGuestRecord(record) && guestKey(record.tableId, record.accountId) === key),
        ),
        guest,
      ],
      result: undefined,
    }));
  }

  /** Stop every claim token of a table from working (a fresh one replaces them). */
  revokeClaims(tableId: string, at: string): Promise<void> {
    return this.store.change((records) => ({
      next: records.map((record) =>
        record.kind === 'claim' && record.tableId === tableId && record.revokedAt === null
          ? { ...record, revokedAt: at }
          : record,
      ),
      result: undefined,
    }));
  }

  /**
   * Redeem a token for an account: check it and spend a use, in one step.
   * A claim token is spent; a share token adds (or extends) a guest access, and
   * the same account redeeming the same share again spends nothing.
   */
  redeem(input: RedeemInput): Promise<RedeemOutcome> {
    return this.store.change<RedeemOutcome>((records) => {
      const token = records.find(
        (record): record is TokenRecord =>
          isToken(record) &&
          record.tokenHash === input.tokenHash &&
          record.tableId === input.tableId,
      );

      if (token === undefined) {
        return { result: { outcome: 'invalid' } };
      }

      const key = guestKey(token.tableId, input.accountId);
      const existing = records.find(
        (record): record is GuestRecord =>
          isGuestRecord(record) && guestKey(record.tableId, record.accountId) === key,
      );

      // The same guest following the same link again: nothing to spend.
      if (
        token.kind === 'share' &&
        existing?.viaTokenId === token.id &&
        isUnexpired(token, input.now)
      ) {
        return { result: { outcome: 'guest', tokenId: token.id, expiresAt: existing.expiresAt } };
      }

      if (!isLive(token, input.now)) {
        return { result: { outcome: 'invalid' } };
      }

      if (token.kind === 'claim') {
        if (!input.ownerless) {
          return { result: { outcome: 'already-claimed' } };
        }

        // A code with no customer (issued before they were bound) can be redeemed by nobody.
        if (token.accountId === null) {
          return { result: { outcome: 'invalid' } };
        }

        // Decided before anything is spent: the right customer can still use the code.
        if (token.accountId !== input.accountId) {
          return { result: { outcome: 'wrong-account' } };
        }

        return { next: spend(records, token), result: { outcome: 'claimed', tokenId: token.id } };
      }

      // A share on a table with no owner cannot exist; refuse it rather than invent a guest.
      if (input.ownerless) {
        return { result: { outcome: 'invalid' } };
      }

      const expiresAt =
        existing !== undefined && Date.parse(existing.expiresAt) > Date.parse(token.expiresAt)
          ? existing.expiresAt
          : token.expiresAt;
      const guest: GuestRecord = {
        kind: 'guest',
        tableId: token.tableId,
        accountId: input.accountId,
        since: new Date(input.now).toISOString(),
        expiresAt,
        viaTokenId: token.id,
      };

      return {
        next: [...spend(records, token).filter((record) => record !== existing), guest],
        result: { outcome: 'guest', tokenId: token.id, expiresAt },
      };
    });
  }

  /** Give back the use a claim token spent, when making the account the owner failed. */
  refund(tokenId: string): Promise<void> {
    return this.store.change((records) => ({
      next: records.map((record) =>
        isToken(record) && record.id === tokenId && record.usedCount > 0
          ? { ...record, usedCount: record.usedCount - 1 }
          : record,
      ),
      result: undefined,
    }));
  }

  /** Rebuilt only when the stored list has changed (a write), so a read is O(1). */
  private index(): Indexes {
    const records = this.store.records;

    if (this.indexes?.from !== records) {
      this.indexes = {
        from: records,
        byHash: new Map(records.filter(isToken).map((token) => [token.tokenHash, token])),
        guests: new Map(
          records
            .filter(isGuestRecord)
            .map((guest) => [guestKey(guest.tableId, guest.accountId), guest]),
        ),
      };
    }

    return this.indexes;
  }
}
