import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newToken, sha256 } from '../auth/token.js';
import {
  TableAccessRepository,
  type AccessRecord,
  type GuestRecord,
  type TokenRecord,
} from './access.repository.js';

const NOW = Date.parse('2026-10-21T13:00:00.000Z');
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

const TABLE = 'table-abc';

/** A token record for `raw`, valid for a day from NOW. */
function tokenFor(raw: string, overrides: Partial<TokenRecord> = {}): TokenRecord {
  return {
    kind: 'claim',
    id: randomUUID(),
    tableId: TABLE,
    tokenHash: sha256(raw),
    createdBy: null,
    createdAt: iso(NOW),
    expiresAt: iso(NOW + 24 * HOUR),
    maxUses: 1,
    usedCount: 0,
    revokedAt: null,
    accountId: 'account-1',
    ...overrides,
  };
}

const redeem = (
  repository: TableAccessRepository,
  raw: string,
  overrides: Partial<{ tableId: string; accountId: string; now: number; ownerless: boolean }> = {},
) =>
  repository.redeem({
    tokenHash: sha256(raw),
    tableId: TABLE,
    accountId: 'account-1',
    now: NOW,
    ownerless: true,
    ...overrides,
  });

describe('TableAccessRepository', () => {
  describe('claim tokens', () => {
    it('are found by the hash of the token, never by the token', async () => {
      const raw = newToken();
      const repository = TableAccessRepository.inMemory();
      await repository.insertToken(tokenFor(raw), NOW);

      expect(repository.findTokenByHash(sha256(raw))).toMatchObject({ kind: 'claim' });
      expect(repository.findTokenByHash(raw)).toBeUndefined();
      expect(JSON.stringify(repository.list())).not.toContain(raw);
    });

    it('are for one account: another account is refused and nothing is spent', async () => {
      const raw = newToken();
      const repository = TableAccessRepository.inMemory();
      await repository.insertToken(tokenFor(raw, { accountId: 'owner-account' }), NOW);

      expect(await redeem(repository, raw, { accountId: 'someone-else' })).toStrictEqual({
        outcome: 'wrong-account',
      });
      // The customer it was issued for can still use it afterwards.
      expect(await redeem(repository, raw, { accountId: 'owner-account' })).toMatchObject({
        outcome: 'claimed',
      });
    });

    it('issued with no account (before codes were bound to a customer) cannot be redeemed', async () => {
      const raw = newToken();
      const repository = TableAccessRepository.inMemory();
      await repository.insertToken(tokenFor(raw, { accountId: null }), NOW);

      expect(await redeem(repository, raw)).toStrictEqual({ outcome: 'invalid' });
    });

    it('work once: the second redemption is invalid', async () => {
      const raw = newToken();
      const repository = TableAccessRepository.inMemory();
      await repository.insertToken(tokenFor(raw), NOW);

      expect(await redeem(repository, raw)).toMatchObject({ outcome: 'claimed' });
      expect(await redeem(repository, raw, { accountId: 'account-2' })).toStrictEqual({
        outcome: 'invalid',
      });
    });

    it('are not spent when the table already has an owner', async () => {
      const raw = newToken();
      const repository = TableAccessRepository.inMemory();
      await repository.insertToken(tokenFor(raw), NOW);

      expect(await redeem(repository, raw, { ownerless: false })).toStrictEqual({
        outcome: 'already-claimed',
      });
      expect(await redeem(repository, raw)).toMatchObject({ outcome: 'claimed' });
    });

    it('give back their use when the claim could not be completed', async () => {
      const raw = newToken();
      const repository = TableAccessRepository.inMemory();
      const token = tokenFor(raw);
      await repository.insertToken(token, NOW);

      const outcome = await redeem(repository, raw);
      await repository.refund(token.id);

      expect(outcome).toMatchObject({ outcome: 'claimed' });
      expect(await redeem(repository, raw)).toMatchObject({ outcome: 'claimed' });
    });

    it('are refused for another table, when expired and when revoked, all with one answer', async () => {
      const repository = TableAccessRepository.inMemory();
      const live = newToken();
      const expired = newToken();
      const revoked = newToken();
      await repository.insertToken(tokenFor(live), NOW);
      await repository.insertToken(tokenFor(expired, { expiresAt: iso(NOW + 1000) }), NOW);
      await repository.insertToken(tokenFor(revoked, { revokedAt: iso(NOW - 1) }), NOW);

      const invalid = { outcome: 'invalid' };

      expect(await redeem(repository, live, { tableId: 'table-xyz' })).toStrictEqual(invalid);
      expect(await redeem(repository, expired, { now: NOW + 1000 })).toStrictEqual(invalid);
      expect(await redeem(repository, revoked)).toStrictEqual(invalid);
      expect(await redeem(repository, newToken())).toStrictEqual(invalid);
    });

    it('stop working when a new one replaces them', async () => {
      const first = newToken();
      const second = newToken();
      const repository = TableAccessRepository.inMemory();
      await repository.insertToken(tokenFor(first), NOW);
      await repository.revokeClaims(TABLE, iso(NOW));
      await repository.insertToken(tokenFor(second), NOW);

      expect(await redeem(repository, first)).toStrictEqual({ outcome: 'invalid' });
      expect(await redeem(repository, second)).toMatchObject({ outcome: 'claimed' });
    });
  });

  describe('share tokens and guests', () => {
    const share = (raw: string, overrides: Partial<TokenRecord> = {}) =>
      tokenFor(raw, { kind: 'share', createdBy: 'owner-1', maxUses: 2, ...overrides });

    it('make the account a guest until the link expires', async () => {
      const raw = newToken();
      const repository = TableAccessRepository.inMemory();
      await repository.insertToken(share(raw), NOW);

      const outcome = await redeem(repository, raw, { ownerless: false });

      expect(outcome).toMatchObject({ outcome: 'guest', expiresAt: iso(NOW + 24 * HOUR) });
      expect(repository.isGuest(TABLE, 'account-1', NOW)).toBe(true);
      expect(repository.isGuest(TABLE, 'account-1', NOW + 24 * HOUR - 1)).toBe(true);
      expect(repository.isGuest(TABLE, 'account-1', NOW + 24 * HOUR)).toBe(false);
      expect(repository.isGuest(TABLE, 'account-2', NOW)).toBe(false);
      expect(repository.isGuest('table-xyz', 'account-1', NOW)).toBe(false);
    });

    it('allow as many different accounts as maxUses, and no more', async () => {
      const raw = newToken();
      const repository = TableAccessRepository.inMemory();
      await repository.insertToken(share(raw), NOW);
      const as = (accountId: string) => redeem(repository, raw, { accountId, ownerless: false });

      expect(await as('a')).toMatchObject({ outcome: 'guest' });
      expect(await as('b')).toMatchObject({ outcome: 'guest' });
      expect(await as('c')).toStrictEqual({ outcome: 'invalid' });
      expect(repository.isGuest(TABLE, 'c', NOW)).toBe(false);
    });

    it('spend nothing when the same account follows the same link again', async () => {
      const raw = newToken();
      const repository = TableAccessRepository.inMemory();
      await repository.insertToken(share(raw), NOW);
      const as = (accountId: string) => redeem(repository, raw, { accountId, ownerless: false });

      await as('a');
      await as('a');
      await as('a');

      expect(await as('b')).toMatchObject({ outcome: 'guest' });
      expect(repository.list().filter((record) => record.kind === 'guest')).toHaveLength(2);
    });

    it('keep the longer access when a guest follows a shorter link', async () => {
      const long = newToken();
      const short = newToken();
      const repository = TableAccessRepository.inMemory();
      await repository.insertToken(share(long, { expiresAt: iso(NOW + 48 * HOUR) }), NOW);
      await repository.insertToken(share(short, { expiresAt: iso(NOW + HOUR) }), NOW);

      await redeem(repository, long, { ownerless: false });
      const outcome = await redeem(repository, short, { ownerless: false });

      expect(outcome).toMatchObject({ expiresAt: iso(NOW + 48 * HOUR) });
      expect(repository.list().filter((record) => record.kind === 'guest')).toHaveLength(1);
    });

    it('are refused on a table with no owner', async () => {
      const raw = newToken();
      const repository = TableAccessRepository.inMemory();
      await repository.insertToken(share(raw), NOW);

      expect(await redeem(repository, raw)).toStrictEqual({ outcome: 'invalid' });
    });

    it('are refused once expired or revoked', async () => {
      const expired = newToken();
      const revoked = newToken();
      const repository = TableAccessRepository.inMemory();
      await repository.insertToken(share(expired), NOW);
      await repository.insertToken(share(revoked, { revokedAt: iso(NOW) }), NOW);

      expect(
        await redeem(repository, expired, { now: NOW + 24 * HOUR, ownerless: false }),
      ).toStrictEqual({ outcome: 'invalid' });
      expect(await redeem(repository, revoked, { ownerless: false })).toStrictEqual({
        outcome: 'invalid',
      });
    });
  });

  it('forgets tokens that can no longer work and guests whose access ended, when a token is added', async () => {
    const gone: GuestRecord = {
      kind: 'guest',
      tableId: TABLE,
      accountId: 'gone',
      since: iso(NOW - 48 * HOUR),
      expiresAt: iso(NOW - HOUR),
      viaTokenId: randomUUID(),
    };
    const here: GuestRecord = { ...gone, accountId: 'here', expiresAt: iso(NOW + HOUR) };
    const repository = TableAccessRepository.inMemory([
      gone,
      here,
      tokenFor(newToken(), { expiresAt: iso(NOW - 1) }),
      tokenFor(newToken(), { usedCount: 1 }),
      tokenFor(newToken(), { revokedAt: iso(NOW - 1) }),
    ]);

    await repository.insertToken(tokenFor(newToken()), NOW);

    expect(repository.list().map((record) => record.kind)).toStrictEqual(['guest', 'claim']);
    expect(repository.isGuest(TABLE, 'here', NOW)).toBe(true);
  });

  describe('on a real file', () => {
    let directory: string;
    let file: string;
    let repository: TableAccessRepository;

    beforeEach(async () => {
      directory = await mkdtemp(join(tmpdir(), 'athar-access-'));
      file = join(directory, 'access.json');
      repository = await TableAccessRepository.open(file);
    });

    afterEach(async () => {
      await repository.close();
      await rm(directory, { recursive: true, force: true });
    });

    it('a single-use claim token is won by exactly one of fifty simultaneous accounts', async () => {
      const raw = newToken();
      await repository.insertToken(tokenFor(raw, { accountId: 'account-7' }), NOW);

      const outcomes = await Promise.all(
        Array.from({ length: 50 }, (_, index) =>
          redeem(repository, raw, { accountId: `account-${index}` }),
        ),
      );

      // Only the account the code is for can win it; the other forty-nine are turned away,
      // as a wrong account until the code is spent and as an invalid code after.
      expect(outcomes.filter((result) => result.outcome === 'claimed')).toHaveLength(1);
      expect(
        outcomes.filter(
          (result) => result.outcome === 'wrong-account' || result.outcome === 'invalid',
        ),
      ).toHaveLength(49);
      expect(repository.list().filter((record) => record.kind === 'claim')[0]).toMatchObject({
        usedCount: 1,
      });
    });

    it('a share token with three uses is shared by exactly three of twenty simultaneous accounts', async () => {
      const raw = newToken();
      await repository.insertToken(
        tokenFor(raw, { kind: 'share', createdBy: 'owner-1', maxUses: 3 }),
        NOW,
      );

      const outcomes = await Promise.all(
        Array.from({ length: 20 }, (_, index) =>
          redeem(repository, raw, { accountId: `account-${index}`, ownerless: false }),
        ),
      );

      expect(outcomes.filter((result) => result.outcome === 'guest')).toHaveLength(3);
      expect(repository.list().filter((record) => record.kind === 'guest')).toHaveLength(3);
    });

    it('stores the hash and never the token, and survives a restart', async () => {
      const raw = newToken();
      await repository.insertToken(tokenFor(raw), NOW);
      await redeem(repository, raw);
      await repository.close();

      const stored = await readFile(file, 'utf8');
      expect(stored).toContain(sha256(raw));
      expect(stored).not.toContain(raw);

      repository = await TableAccessRepository.open(file);

      expect(repository.findTokenByHash(sha256(raw))).toMatchObject({ usedCount: 1 });
      expect(await redeem(repository, raw)).toStrictEqual({ outcome: 'invalid' });
    });

    it('refuses a file holding two records for the same token', async () => {
      await repository.close();
      const record = tokenFor(newToken());
      const duplicated: AccessRecord[] = [record, { ...record, id: randomUUID() }];
      await writeFile(file, JSON.stringify({ version: 1, access: duplicated }));

      await expect(TableAccessRepository.open(file)).rejects.toThrow();
      repository = TableAccessRepository.inMemory();
    });
  });
});
