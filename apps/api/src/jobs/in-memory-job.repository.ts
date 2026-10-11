import { isActiveJobState, type DrawingJob } from '@athar/contracts';
import type { InsertResult, JobRepository } from './job-repository.js';

interface StoredJob {
  job: DrawingJob;
  readonly clientRequestId: string;
}

/** A key that cannot collide: neither part can contain a NUL. */
const requestKey = (tableId: string, clientRequestId: string): string =>
  `${tableId}\u0000${clientRequestId}`;

/**
 * Jobs held in memory, for this milestone. Everything is lost when the process
 * restarts, which is acceptable only because the table is simulated; the app
 * treats `JOB_NOT_FOUND` for a job it knows as a normal state.
 *
 * History is bounded **per table**: when a table holds more than `historyLimit`
 * jobs, its oldest finished ones are forgotten, and their idempotency entries
 * with them, so a repeated request id can no longer find a job that is gone. A
 * job that is still active is never forgotten.
 */
export class InMemoryJobRepository implements JobRepository {
  private readonly jobs = new Map<string, StoredJob>();
  /** Job ids of each table, oldest first. */
  private readonly byTable = new Map<string, string[]>();
  private readonly byRequest = new Map<string, string>();

  constructor(private readonly historyLimit: number) {
    if (!Number.isInteger(historyLimit) || historyLimit < 1) {
      throw new RangeError('The job history limit must be a whole number of at least 1.');
    }
  }

  /**
   * The check and the insert are one synchronous step: nothing can run between
   * them, so two requests cannot both pass. Keep it that way: do not add an
   * `await` between reading `byRequest` or the active job and storing the job.
   */
  insertIfNoActive(job: DrawingJob, clientRequestId: string): Promise<InsertResult> {
    const earlier = this.byRequest.get(requestKey(job.tableId, clientRequestId));
    const repeated = earlier === undefined ? undefined : this.jobs.get(earlier);

    if (repeated !== undefined) {
      return Promise.resolve({ kind: 'replayed', job: { ...repeated.job } });
    }

    const active = this.activeOf(job.tableId);

    if (active !== undefined) {
      return Promise.resolve({ kind: 'busy', activeJobId: active.job.id });
    }

    this.jobs.set(job.id, { job: { ...job }, clientRequestId });
    this.byTable.set(job.tableId, [...(this.byTable.get(job.tableId) ?? []), job.id]);
    this.byRequest.set(requestKey(job.tableId, clientRequestId), job.id);
    this.evictOldFinished(job.tableId);

    return Promise.resolve({ kind: 'inserted' });
  }

  findByClientRequestId(tableId: string, clientRequestId: string): Promise<DrawingJob | undefined> {
    const id = this.byRequest.get(requestKey(tableId, clientRequestId));
    const stored = id === undefined ? undefined : this.jobs.get(id);

    return Promise.resolve(stored === undefined ? undefined : { ...stored.job });
  }

  findActive(tableId: string): Promise<DrawingJob | undefined> {
    const active = this.activeOf(tableId);

    return Promise.resolve(active === undefined ? undefined : { ...active.job });
  }

  get(jobId: string): Promise<DrawingJob | undefined> {
    const stored = this.jobs.get(jobId);

    return Promise.resolve(stored === undefined ? undefined : { ...stored.job });
  }

  update(job: DrawingJob): Promise<void> {
    const stored = this.jobs.get(job.id);

    if (stored !== undefined) {
      stored.job = { ...job };
    }

    return Promise.resolve();
  }

  listRecent(tableId: string, limit: number): Promise<readonly DrawingJob[]> {
    const ids = this.byTable.get(tableId) ?? [];
    const recent: DrawingJob[] = [];

    for (let index = ids.length - 1; index >= 0 && recent.length < limit; index -= 1) {
      const stored = this.jobs.get(ids[index] ?? '');

      if (stored !== undefined) {
        recent.push({ ...stored.job });
      }
    }

    return Promise.resolve(recent);
  }

  private activeOf(tableId: string): StoredJob | undefined {
    for (const id of this.byTable.get(tableId) ?? []) {
      const stored = this.jobs.get(id);

      if (stored !== undefined && isActiveJobState(stored.job.state)) {
        return stored;
      }
    }

    return undefined;
  }

  /** Forget the table's oldest finished jobs until it is within the limit. */
  private evictOldFinished(tableId: string): void {
    const ids = this.byTable.get(tableId) ?? [];
    const kept = [...ids];

    for (const id of ids) {
      if (kept.length <= this.historyLimit) {
        break;
      }

      const stored = this.jobs.get(id);

      if (stored !== undefined && !isActiveJobState(stored.job.state)) {
        this.jobs.delete(id);
        this.byRequest.delete(requestKey(tableId, stored.clientRequestId));
        kept.splice(kept.indexOf(id), 1);
      }
    }

    this.byTable.set(tableId, kept);
  }
}
