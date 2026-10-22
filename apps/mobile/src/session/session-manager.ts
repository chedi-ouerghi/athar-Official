/**
 * The signed-in session: where it is kept, and the access token every call needs.
 *
 * The access token lives 15 minutes and a refresh token works once, so concurrent
 * callers must share one refresh (a second refresh with the same token would sign
 * the user out). No React Native import: storage is injected, so this runs under
 * the Node test runner.
 */

import type { SessionResponse } from '@athar/contracts';
import { ApiError } from '../api/http-client';

export interface SessionStorage {
  read(): Promise<SessionResponse | undefined>;
  write(session: SessionResponse): Promise<void>;
  clear(): Promise<void>;
}

/** Refresh this long before the token expires, so a slow request does not arrive with a dead one. */
const REFRESH_MARGIN_MS = 30_000;

export class SessionManager {
  private session: SessionResponse | undefined;
  private refreshing: Promise<void> | undefined;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly storage: SessionStorage,
    private readonly refresh: (refreshToken: string) => Promise<SessionResponse>,
    private readonly now: () => number = Date.now,
  ) {}

  /** Read the stored session, if any. Call once at start-up. */
  async load(): Promise<void> {
    this.session = await this.storage.read().catch(() => undefined);
    this.notify();
  }

  get current(): SessionResponse | undefined {
    return this.session;
  }

  async set(session: SessionResponse): Promise<void> {
    this.session = session;
    await this.storage.write(session).catch(() => undefined);
    this.notify();
  }

  async clear(): Promise<void> {
    this.session = undefined;
    await this.storage.clear().catch(() => undefined);
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  /** A token that is valid now, or `undefined` when signed out. Never throws. */
  async accessToken(): Promise<string | undefined> {
    if (this.session !== undefined && this.expiresSoon(this.session)) {
      this.refreshing ??= this.renew().finally(() => {
        this.refreshing = undefined;
      });
      await this.refreshing;
    }

    return this.session?.accessToken;
  }

  private expiresSoon(session: SessionResponse): boolean {
    return Date.parse(session.accessTokenExpiresAt) - this.now() < REFRESH_MARGIN_MS;
  }

  private async renew(): Promise<void> {
    const stale = this.session;

    if (stale === undefined) {
      return;
    }

    try {
      await this.set(await this.refresh(stale.refreshToken));
    } catch (error) {
      // The server refused the refresh token (expired, used, revoked): signed out.
      // Anything else (no connection) keeps the session; the call that follows fails by itself.
      if (error instanceof ApiError && error.kind === 'http' && (error.status ?? 500) < 500) {
        await this.clear();
      }
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
