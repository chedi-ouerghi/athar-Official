/**
 * The seam through which the registry learns who is a guest of a table, so the
 * tables module imports nothing from the access module (the same shape as
 * `ACTIVE_JOB_LOOKUP`). `TableAccessRepository` provides it.
 */
export interface GuestLookup {
  /** Whether `accountId` holds a guest access to the table that has not ended by `now` (ms). */
  isGuest(tableId: string, accountId: string, now: number): boolean;
}

/** Dependency-injection token for the {@link GuestLookup}. Optional: no token, no guests. */
export const GUEST_LOOKUP = Symbol('GUEST_LOOKUP');
