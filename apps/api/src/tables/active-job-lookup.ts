/**
 * The seam between tables and drawing jobs.
 *
 * A table's public view carries the id of the job it is running, but the jobs
 * module does not exist yet and tables must not depend on it. This interface is
 * all `tables` knows about jobs. The jobs module will provide a real
 * implementation under {@link ACTIVE_JOB_LOOKUP}; until then {@link NoActiveJobs}
 * answers `null` for every table.
 */
export interface ActiveJobLookup {
  /** Id of the job that is queued, drawing or paused on this table, or `null`. */
  activeJobIdFor(tableId: string): Promise<string | null>;
}

/** Dependency-injection token for the {@link ActiveJobLookup}. */
export const ACTIVE_JOB_LOOKUP = Symbol('ACTIVE_JOB_LOOKUP');

/** The default: no jobs exist yet, so no table has an active one. */
export class NoActiveJobs implements ActiveJobLookup {
  activeJobIdFor(): Promise<string | null> {
    return Promise.resolve(null);
  }
}
