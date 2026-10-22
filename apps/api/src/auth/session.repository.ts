/**
 * Sessions, persisted in `SESSIONS_DATA_FILE` (so a restart signs nobody out),
 * or held in memory for tests. Written only on login, activation, refresh,
 * logout and revocation; authenticating a request only reads.
 *
 * A record holds token hashes only. Sessions past their absolute expiry are
 * dropped whenever a new one is created.
 */

import { z } from 'zod';
import { accountRoleSchema } from '@athar/contracts';
import {
  JsonFileStore,
  MemoryStore,
  type RecordStore,
} from '../common/persistence/json-file-store.js';

export const SESSIONS_FILE_VERSION = 1;

export const sessionRecordSchema = z.object({
  id: z.string().min(1),
  accountId: z.string().min(1),
  role: accountRoleSchema,
  accessHash: z.string(),
  accessExpiresAt: z.string(),
  refreshHash: z.string(),
  /** Absolute: set at creation, never extended by a refresh. */
  refreshExpiresAt: z.string(),
  /** The refresh token rotated out last; presenting it again is reuse. */
  previousRefreshHash: z.string().nullable(),
  createdAt: z.string(),
  revokedAt: z.string().nullable(),
});
export type SessionRecord = z.infer<typeof sessionRecordSchema>;

const sessionsSchema = z.array(sessionRecordSchema).superRefine((sessions, context) => {
  const seen = new Set<string>();

  for (const [index, session] of sessions.entries()) {
    if (seen.has(session.id)) {
      context.addIssue({ code: 'custom', path: [index, 'id'], message: 'duplicate session id' });
    }

    seen.add(session.id);
  }
});

interface Indexes {
  readonly from: readonly SessionRecord[];
  readonly byAccess: ReadonlyMap<string, SessionRecord>;
  /** Current and previous refresh hashes. */
  readonly byRefresh: ReadonlyMap<string, SessionRecord>;
}

export class SessionRepository {
  private indexes: Indexes | undefined;

  private constructor(private readonly store: RecordStore<SessionRecord>) {}

  static inMemory(seed: readonly SessionRecord[] = []): SessionRepository {
    return new SessionRepository(new MemoryStore(seed));
  }

  /** @throws StartupConfigurationError, as for the tables file. */
  static async open(file: string): Promise<SessionRepository> {
    return new SessionRepository(
      await JsonFileStore.open(file, {
        setting: 'SESSIONS_DATA_FILE',
        key: 'sessions',
        version: SESSIONS_FILE_VERSION,
        schema: sessionsSchema,
        busyHint:
          'Only one process may write the sessions file at a time: stop the API before starting another one.',
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

  list(): readonly SessionRecord[] {
    return this.store.records;
  }

  findByAccessHash(hash: string): SessionRecord | undefined {
    return this.index().byAccess.get(hash);
  }

  /** The session whose current or previous refresh token has this hash. */
  findByRefreshHash(hash: string): SessionRecord | undefined {
    return this.index().byRefresh.get(hash);
  }

  /** Store a new session, dropping every session whose absolute expiry has passed. */
  create(record: SessionRecord): Promise<void> {
    const now = Date.parse(record.createdAt);

    return this.store.change((sessions) => ({
      next: [...sessions.filter((session) => Date.parse(session.refreshExpiresAt) > now), record],
      result: undefined,
    }));
  }

  /**
   * Replace one session with what `change` makes of it, inside the write queue,
   * so a check made in `change` cannot race another refresh. `undefined` stores
   * nothing. Resolves to the stored session, or `undefined`.
   */
  update(
    id: string,
    change: (session: SessionRecord) => SessionRecord | undefined,
  ): Promise<SessionRecord | undefined> {
    return this.store.change((sessions) => {
      const existing = sessions.find((session) => session.id === id);
      const updated = existing === undefined ? undefined : change(existing);

      return updated === undefined
        ? { result: undefined }
        : {
            next: sessions.map((session) => (session.id === id ? updated : session)),
            result: updated,
          };
    });
  }

  /** Revoke every live session of an account. */
  revokeAllFor(accountId: string, at: string): Promise<void> {
    return this.store.change((sessions) => ({
      next: sessions.map((session) =>
        session.accountId === accountId && session.revokedAt === null
          ? { ...session, revokedAt: at }
          : session,
      ),
      result: undefined,
    }));
  }

  /** Rebuilt only when the stored list has changed (a write), so a read is O(1). */
  private index(): Indexes {
    const records = this.store.records;

    if (this.indexes?.from !== records) {
      const byRefresh = new Map<string, SessionRecord>();

      for (const session of records) {
        if (session.previousRefreshHash !== null) {
          byRefresh.set(session.previousRefreshHash, session);
        }
        byRefresh.set(session.refreshHash, session);
      }

      this.indexes = {
        from: records,
        byAccess: new Map(records.map((session) => [session.accessHash, session])),
        byRefresh,
      };
    }

    return this.indexes;
  }
}
