/**
 * Sign-in, activation and sessions (decision D5).
 *
 * - Tokens are 256 random bits; only their SHA-256 is stored.
 * - An access token lives 15 minutes. A refresh token works once: each refresh
 *   returns a new pair, and presenting the refresh token rotated out last
 *   (reuse: someone else holds a copy) revokes the whole session.
 * - A session ends at an absolute limit from sign-in, 30 days for a customer and
 *   12 hours for an admin; refreshing never extends it.
 * - Every time comparison uses the injected `Clock`.
 */

import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { adminPasswordSchema } from '@athar/contracts';
import type {
  AccountRole,
  ActivateRequest,
  AuthAccount,
  LoginRequest,
  SessionResponse,
} from '@athar/contracts';
import { DomainException } from '../common/http/domain.exception.js';
import { CLOCK, type Clock } from '../device/clock.js';
import { AccountRepository, type AccountRecord } from './account.repository.js';
import { toAuthAccount } from './accounts.service.js';
import { LoginThrottle, clearedOnSuccess, signInRules } from './login-throttle.js';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password-hasher.js';
import { SessionRepository, type SessionRecord } from './session.repository.js';
import { newToken, safeEqual, sha256 } from './token.js';

export const ACCESS_TOKEN_TTL_MS = 15 * 60_000;

/** Absolute session length per role, from sign-in. */
export const SESSION_TTL_MS: Readonly<Record<AccountRole, number>> = {
  customer: 30 * 24 * 60 * 60_000,
  admin: 12 * 60 * 60_000,
};

/** One message for every sign-in failure, so it never says whether the email exists. */
export const INVALID_CREDENTIALS_MESSAGE = 'The email or password is incorrect.';
export const ACTIVATION_INVALID_MESSAGE = 'The email or activation code is incorrect or expired.';
export const SESSION_EXPIRED_MESSAGE = 'The session has ended. Sign in again.';
export const UNAUTHORIZED_MESSAGE = 'Authentication is required.';

/** Who a valid access token belongs to. */
export interface Authenticated {
  readonly account: AuthAccount;
  readonly sessionId: string;
}

const iso = (milliseconds: number) => new Date(milliseconds).toISOString();
const sessionExpired = () => new DomainException('SESSION_EXPIRED', SESSION_EXPIRED_MESSAGE);

@Injectable()
export class AuthService {
  constructor(
    private readonly accounts: AccountRepository,
    private readonly sessions: SessionRepository,
    private readonly throttle: LoginThrottle,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Unknown email, wrong password, disabled or not activated: all `INVALID_CREDENTIALS`. */
  async login(input: LoginRequest, ip: string): Promise<SessionResponse> {
    // Reserved before the first await, so concurrent guesses are counted at once.
    const rules = signInRules('login', input.email, ip);
    this.throttle.reserve(rules);

    const account = await this.accounts.findByEmail(input.email);
    // Always one scrypt, so the time taken does not reveal whether the email exists.
    const matches = await verifyPassword(
      input.password,
      account?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!matches || account === undefined || account.passwordHash === null || account.disabled) {
      throw new DomainException('INVALID_CREDENTIALS', INVALID_CREDENTIALS_MESSAGE);
    }

    this.throttle.clear(clearedOnSuccess(rules));

    return (await this.startSession(account)).response;
  }

  /**
   * Set the password with the one-time code an admin issued, and sign in. Any
   * failure is the same `ACTIVATION_INVALID`.
   *
   * The session is created **before** the code is consumed, so a failure to
   * store it leaves the code usable; if consuming then fails, the session is
   * revoked.
   */
  async activate(input: ActivateRequest, ip: string): Promise<SessionResponse> {
    const rules = signInRules('activate', input.email, ip);
    this.throttle.reserve(rules);

    const codeHash = sha256(input.activationCode);
    const usable = (account: AccountRecord | undefined): account is AccountRecord =>
      account !== undefined &&
      !account.disabled &&
      account.activationCodeHash !== null &&
      account.activationExpiresAt !== null &&
      Date.parse(account.activationExpiresAt) > this.clock.now() &&
      safeEqual(account.activationCodeHash, codeHash);

    const account = await this.accounts.findByEmail(input.email);

    if (!usable(account)) {
      throw new DomainException('ACTIVATION_INVALID', ACTIVATION_INVALID_MESSAGE);
    }

    if (account.role === 'admin' && !adminPasswordSchema.safeParse(input.password).success) {
      throw new DomainException(
        'VALIDATION_FAILED',
        'An admin password needs 14 to 200 characters.',
      );
    }

    const passwordHash = await hashPassword(input.password);
    const { id, response } = await this.startSession(account);
    let activated: AccountRecord | undefined;

    try {
      activated = await this.accounts.update(account.id, (current) =>
        // Checked again inside the write queue, so a code cannot be used twice at once.
        usable(current)
          ? {
              ...current,
              passwordHash,
              activationCodeHash: null,
              activationExpiresAt: null,
              updatedAt: iso(this.clock.now()),
            }
          : undefined,
      );
    } finally {
      if (activated === undefined) {
        await this.logout(id).catch(() => undefined);
      }
    }

    if (activated === undefined) {
      throw new DomainException('ACTIVATION_INVALID', ACTIVATION_INVALID_MESSAGE);
    }

    this.throttle.clear(clearedOnSuccess(rules));

    return response;
  }

  /** A new token pair for a valid refresh token; reuse revokes the session. */
  async refresh(refreshToken: string): Promise<SessionResponse> {
    const hash = sha256(refreshToken);
    const found = this.sessions.findByRefreshHash(hash);

    if (found === undefined) {
      throw sessionExpired();
    }

    const now = this.clock.now();
    const access = newToken();
    const refresh = newToken();
    let reused = false;

    const rotated = await this.sessions.update(found.id, (session) => {
      if (session.revokedAt !== null || Date.parse(session.refreshExpiresAt) <= now) {
        return undefined;
      }

      if (!safeEqual(session.refreshHash, hash)) {
        reused = true;
        return { ...session, revokedAt: iso(now) };
      }

      return {
        ...session,
        accessHash: sha256(access),
        accessExpiresAt: iso(
          Math.min(now + ACCESS_TOKEN_TTL_MS, Date.parse(session.refreshExpiresAt)),
        ),
        refreshHash: sha256(refresh),
        previousRefreshHash: session.refreshHash,
      };
    });

    const account = rotated === undefined || reused ? undefined : await this.activeAccount(rotated);

    if (rotated === undefined || account === undefined) {
      throw sessionExpired();
    }

    return this.response(rotated, access, refresh, account);
  }

  /** End one session. Its tokens stop working at once. */
  async logout(sessionId: string): Promise<void> {
    const at = iso(this.clock.now());

    await this.sessions.update(sessionId, (session) =>
      session.revokedAt === null ? { ...session, revokedAt: at } : undefined,
    );
  }

  /** End every session of an account (access reset, disabling). */
  revokeAllFor(accountId: string): Promise<void> {
    return this.sessions.revokeAllFor(accountId, iso(this.clock.now()));
  }

  /**
   * Who an access token belongs to. An unknown token is `UNAUTHORIZED`; a known
   * one that has expired or been revoked is `SESSION_EXPIRED`, so the client
   * knows to refresh or sign in again.
   */
  async authenticate(accessToken: string): Promise<Authenticated> {
    const session = this.sessions.findByAccessHash(sha256(accessToken));

    if (session === undefined) {
      throw new DomainException('UNAUTHORIZED', UNAUTHORIZED_MESSAGE);
    }

    const account =
      session.revokedAt === null && Date.parse(session.accessExpiresAt) > this.clock.now()
        ? await this.activeAccount(session)
        : undefined;

    if (account === undefined) {
      throw sessionExpired();
    }

    return { account: toAuthAccount(account), sessionId: session.id };
  }

  private async activeAccount(session: SessionRecord): Promise<AccountRecord | undefined> {
    const account = await this.accounts.get(session.accountId);

    return account === undefined || account.disabled ? undefined : account;
  }

  private async startSession(
    account: AccountRecord,
  ): Promise<{ id: string; response: SessionResponse }> {
    const now = this.clock.now();
    const access = newToken();
    const refresh = newToken();
    const refreshExpiresAt = now + SESSION_TTL_MS[account.role];
    const session: SessionRecord = {
      id: randomUUID(),
      accountId: account.id,
      role: account.role,
      accessHash: sha256(access),
      accessExpiresAt: iso(Math.min(now + ACCESS_TOKEN_TTL_MS, refreshExpiresAt)),
      refreshHash: sha256(refresh),
      refreshExpiresAt: iso(refreshExpiresAt),
      previousRefreshHash: null,
      createdAt: iso(now),
      revokedAt: null,
    };

    await this.sessions.create(session);

    return { id: session.id, response: this.response(session, access, refresh, account) };
  }

  private response(
    session: SessionRecord,
    accessToken: string,
    refreshToken: string,
    account: AccountRecord,
  ): SessionResponse {
    return {
      accessToken,
      accessTokenExpiresAt: session.accessExpiresAt,
      refreshToken,
      refreshTokenExpiresAt: session.refreshExpiresAt,
      account: toAuthAccount(account),
    };
  }
}
