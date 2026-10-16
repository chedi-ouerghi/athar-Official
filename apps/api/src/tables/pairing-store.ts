/**
 * Pairings (decision D9): "this signed-in owner opened this table recently".
 *
 * A pairing belongs to one session and one table, and slides: it lives
 * {@link PAIRING_TTL_MS} past the last pairing request or successful job start
 * or command. Keyed by session, so a revoked or expired session's pairings can
 * never be used again (its token no longer authenticates) and are dropped once
 * they expire. Ownership is the caller's job; this store only remembers.
 *
 * shortcut: lost on restart, and one API process only; the app re-pairs
 * automatically (Phase 6). Move it next to sessions when the API scales out.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Pairing } from '@athar/contracts';
import { CLOCK, type Clock } from '../device/clock.js';

export const PAIRING_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class PairingStore {
  /** `sessionId tableId` → expiry in ms. A table id never contains a space. */
  private readonly expiries = new Map<string, number>();

  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  /** Open or extend the session's pairing with the table. */
  pair(sessionId: string, tableId: string): Pairing {
    const now = this.clock.now();

    // Prune on write, so memory is bounded by the pairings of the last 15 minutes.
    for (const [key, expiresAt] of this.expiries) {
      if (expiresAt <= now) {
        this.expiries.delete(key);
      }
    }

    const expiresAt = now + PAIRING_TTL_MS;
    this.expiries.set(key(sessionId, tableId), expiresAt);

    return { tableId, expiresAt: new Date(expiresAt).toISOString() };
  }

  unpair(sessionId: string, tableId: string): void {
    this.expiries.delete(key(sessionId, tableId));
  }

  isPaired(sessionId: string, tableId: string): boolean {
    const expiresAt = this.expiries.get(key(sessionId, tableId));

    if (expiresAt === undefined) {
      return false;
    }

    if (expiresAt <= this.clock.now()) {
      this.expiries.delete(key(sessionId, tableId));
      return false;
    }

    return true;
  }
}

const key = (sessionId: string, tableId: string) => `${sessionId} ${tableId}`;
