/**
 * Storage of drawing jobs, behind an interface so the in-memory store used now can
 * be replaced by a database without touching the service above it.
 *
 * `insertIfNoActive` is the one place the "one active job per table" rule and
 * idempotency are decided, and each implementation must make that decision
 * atomically: in memory, by doing the check and the insert with no `await`
 * between them; in a database, by a partial unique index on the table for active
 * states (docs/architecture.md, "One active job per table").
 */

import type { DrawingJob } from '@athar/contracts';

export type InsertResult =
  /** The job was stored, and is now the table's active job. */
  | { readonly kind: 'inserted' }
  /** This (table, client request id) was already used: nothing was stored. */
  | { readonly kind: 'replayed'; readonly job: DrawingJob }
  /** The table already has an active job: nothing was stored. */
  | { readonly kind: 'busy'; readonly activeJobId: string };

export interface JobRepository {
  /**
   * Store a new job, unless the request is a repeat or the table is busy.
   *
   * Decided in this order, atomically: a repeat of an earlier request returns that
   * job's record (even if the table is busy with it, which is the point of
   * idempotency); otherwise a table with an active job is `busy`; otherwise the
   * job is stored. Storing it may evict the oldest finished jobs of the table, and
   * their idempotency entries with them.
   */
  insertIfNoActive(job: DrawingJob, clientRequestId: string): Promise<InsertResult>;

  /** The job a (table, client request id) pair created, while it is still remembered. */
  findByClientRequestId(tableId: string, clientRequestId: string): Promise<DrawingJob | undefined>;

  /** The table's job that is queued, drawing or paused, if any. */
  findActive(tableId: string): Promise<DrawingJob | undefined>;

  get(jobId: string): Promise<DrawingJob | undefined>;

  /** Replace a stored job. Does nothing for a job that has been evicted. */
  update(job: DrawingJob): Promise<void>;

  /** Up to `limit` of the table's jobs, newest first. */
  listRecent(tableId: string, limit: number): Promise<readonly DrawingJob[]>;
}

/** Dependency-injection token for the {@link JobRepository}. */
export const JOB_REPOSITORY = Symbol('JOB_REPOSITORY');
