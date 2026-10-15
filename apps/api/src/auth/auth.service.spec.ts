import { Logger } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DomainException } from '../common/http/domain.exception.js';
import { FakeClock } from '../device/fake-clock.js';
import { AccountRepository } from './account.repository.js';
import { AccountsService } from './accounts.service.js';
import {
  ACCESS_TOKEN_TTL_MS,
  AuthService,
  INVALID_CREDENTIALS_MESSAGE,
  SESSION_TTL_MS,
} from './auth.service.js';
import { LoginThrottle } from './login-throttle.js';
import type * as PasswordHasher from './password-hasher.js';
import { verifyPassword } from './password-hasher.js';
import { SessionRepository } from './session.repository.js';

// The real hasher, wrapped so a test can count how often a password is checked.
vi.mock('./password-hasher.js', async (importOriginal) => {
  const real = await importOriginal<typeof PasswordHasher>();

  return { ...real, verifyPassword: vi.fn(real.verifyPassword) };
});

const PASSWORD = 'a-good-password';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

function setup() {
  const clock = new FakeClock();
  const accounts = AccountRepository.inMemory();
  const sessions = SessionRepository.inMemory();

  return {
    clock,
    accounts,
    sessions,
    service: new AccountsService(accounts, clock),
    auth: new AuthService(accounts, sessions, new LoginThrottle(clock), clock),
  };
}

/** The code and message a promise rejects with. */
async function failure(promise: Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof DomainException) {
      return { code: error.code, message: error.message };
    }
    throw error;
  }
  throw new Error('expected a failure');
}

describe('AuthService', () => {
  beforeAll(() => Logger.overrideLogger(false));
  afterAll(() => Logger.overrideLogger(['log', 'error', 'warn']));

  describe('login', () => {
    it('signs in with the right password and returns a working session', async () => {
      const { service, auth } = setup();
      const admin = await service.createAdmin({
        email: 'boss@athar.test',
        displayName: 'Boss',
        password: PASSWORD,
      });

      const session = await auth.login({ email: 'boss@athar.test', password: PASSWORD }, 'ip');

      expect(session.account).toStrictEqual(admin);
      expect(await auth.authenticate(session.accessToken)).toMatchObject({ account: admin });
    });

    it('gives one identical answer for an unknown email, a wrong password, a disabled account and one not yet activated', async () => {
      const { service, auth, accounts } = setup();
      await service.createAdmin({ email: 'a@athar.test', displayName: 'A', password: PASSWORD });
      const disabled = await service.createAdmin({
        email: 'd@athar.test',
        displayName: 'D',
        password: PASSWORD,
      });
      await accounts.update(disabled.id, (account) => ({ ...account, disabled: true }));
      await service.createCustomer({ email: 'new@athar.test', displayName: 'New' });

      const answers = await Promise.all([
        failure(auth.login({ email: 'nobody@athar.test', password: PASSWORD }, 'ip')),
        failure(auth.login({ email: 'a@athar.test', password: 'wrong-password' }, 'ip')),
        failure(auth.login({ email: 'd@athar.test', password: PASSWORD }, 'ip')),
        failure(auth.login({ email: 'new@athar.test', password: PASSWORD }, 'ip')),
      ]);

      for (const answer of answers) {
        expect(answer).toStrictEqual({
          code: 'INVALID_CREDENTIALS',
          message: INVALID_CREDENTIALS_MESSAGE,
        });
      }
    });

    it('refuses the 6th attempt after 5 failures, even with the right password', async () => {
      const { service, auth } = setup();
      await service.createAdmin({ email: 'a@athar.test', displayName: 'A', password: PASSWORD });

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await failure(auth.login({ email: 'a@athar.test', password: 'wrong-password' }, 'ip'));
      }

      expect(
        (await failure(auth.login({ email: 'a@athar.test', password: PASSWORD }, 'ip'))).code,
      ).toBe('TOO_MANY_REQUESTS');
      // Another address is counted on its own.
      await auth.login({ email: 'a@athar.test', password: PASSWORD }, 'other-ip');
    });
  });

  describe('throttling', () => {
    it('lets at most 5 of 20 concurrent wrong guesses reach the password check', async () => {
      const { service, auth } = setup();
      await service.createAdmin({ email: 'a@athar.test', displayName: 'A', password: PASSWORD });
      vi.mocked(verifyPassword).mockClear();

      const answers = await Promise.all(
        Array.from({ length: 20 }, () =>
          failure(auth.login({ email: 'a@athar.test', password: 'wrong-password' }, 'ip')),
        ),
      );

      expect(vi.mocked(verifyPassword).mock.calls.length).toBeLessThanOrEqual(5);
      expect(answers.filter((answer) => answer.code === 'INVALID_CREDENTIALS')).toHaveLength(5);
      expect(answers.filter((answer) => answer.code === 'TOO_MANY_REQUESTS')).toHaveLength(15);
    });

    it('refuses an email after 20 failures in an hour, whatever the IP', async () => {
      const { service, auth } = setup();
      await service.createAdmin({ email: 'a@athar.test', displayName: 'A', password: PASSWORD });

      for (let ip = 0; ip < 20; ip += 1) {
        await failure(
          auth.login({ email: 'a@athar.test', password: 'wrong-password' }, `ip-${ip}`),
        );
      }

      expect(
        (await failure(auth.login({ email: 'a@athar.test', password: PASSWORD }, 'fresh-ip'))).code,
      ).toBe('TOO_MANY_REQUESTS');
    });
  });

  describe('refresh', () => {
    async function signedIn() {
      const context = setup();
      await context.service.createAdmin({
        email: 'a@athar.test',
        displayName: 'A',
        password: PASSWORD,
      });
      const session = await context.auth.login({ email: 'a@athar.test', password: PASSWORD }, 'ip');

      return { ...context, session };
    }

    it('returns a new pair; the old access token stops working', async () => {
      const { auth, session } = await signedIn();

      const next = await auth.refresh(session.refreshToken);

      expect(next.accessToken).not.toBe(session.accessToken);
      expect(next.refreshToken).not.toBe(session.refreshToken);
      expect(next.refreshTokenExpiresAt).toBe(session.refreshTokenExpiresAt);
      await auth.authenticate(next.accessToken);
      expect((await failure(auth.authenticate(session.accessToken))).code).toBe('UNAUTHORIZED');
    });

    it('revokes the whole session when a refresh token is used twice', async () => {
      const { auth, session } = await signedIn();
      const next = await auth.refresh(session.refreshToken);

      expect((await failure(auth.refresh(session.refreshToken))).code).toBe('SESSION_EXPIRED');

      // The legitimate holder of the newest pair is signed out too.
      expect((await failure(auth.authenticate(next.accessToken))).code).toBe('SESSION_EXPIRED');
      expect((await failure(auth.refresh(next.refreshToken))).code).toBe('SESSION_EXPIRED');
    });

    it('lets only one of two simultaneous refreshes through, and revokes the session', async () => {
      const { auth, session } = await signedIn();

      const results = await Promise.allSettled([
        auth.refresh(session.refreshToken),
        auth.refresh(session.refreshToken),
      ]);

      expect(results.map((result) => result.status)).toStrictEqual(['fulfilled', 'rejected']);
    });

    it('answers SESSION_EXPIRED for an unknown refresh token', async () => {
      const { auth } = await signedIn();

      expect((await failure(auth.refresh('not-a-token'))).code).toBe('SESSION_EXPIRED');
    });
  });

  describe('expiry, on the injected clock', () => {
    it('ends an access token after 15 minutes; a refresh brings a new one', async () => {
      const { clock, service, auth } = setup();
      await service.createAdmin({ email: 'a@athar.test', displayName: 'A', password: PASSWORD });
      const session = await auth.login({ email: 'a@athar.test', password: PASSWORD }, 'ip');

      clock.advance(ACCESS_TOKEN_TTL_MS - 1);
      await auth.authenticate(session.accessToken);

      clock.advance(1);
      expect((await failure(auth.authenticate(session.accessToken))).code).toBe('SESSION_EXPIRED');

      const next = await auth.refresh(session.refreshToken);
      await auth.authenticate(next.accessToken);
    });

    it('ends an admin session 12 hours after sign-in, however often it is refreshed', async () => {
      const { clock, service, auth } = setup();
      await service.createAdmin({ email: 'a@athar.test', displayName: 'A', password: PASSWORD });
      let session = await auth.login({ email: 'a@athar.test', password: PASSWORD }, 'ip');

      expect(SESSION_TTL_MS.admin).toBe(12 * HOUR);
      for (let elapsed = 10 * MINUTE; elapsed < 12 * HOUR; elapsed += 10 * MINUTE) {
        clock.advance(10 * MINUTE);
        session = await auth.refresh(session.refreshToken);
      }

      // The last access token ends with the session, not 15 minutes later.
      expect(Date.parse(session.accessTokenExpiresAt)).toBe(Date.parse('2026-01-01T12:00:00.000Z'));

      clock.advance(10 * MINUTE);
      expect((await failure(auth.refresh(session.refreshToken))).code).toBe('SESSION_EXPIRED');
      expect((await failure(auth.authenticate(session.accessToken))).code).toBe('SESSION_EXPIRED');
    });

    it('gives a customer 30 days', async () => {
      const { clock, service, auth } = setup();
      const { activationCode } = await service.createCustomer({
        email: 'c@athar.test',
        displayName: 'C',
      });
      const session = await auth.activate(
        { email: 'c@athar.test', activationCode, password: PASSWORD },
        'ip',
      );

      clock.advance(SESSION_TTL_MS.customer - 1);
      await auth.refresh(session.refreshToken);
      expect(SESSION_TTL_MS.customer).toBe(30 * 24 * HOUR);
    });
  });

  describe('activate', () => {
    it('sets the password once, signs in, and then refuses the same code', async () => {
      const { service, auth, accounts } = setup();
      const { account, activationCode } = await service.createCustomer({
        email: 'c@athar.test',
        displayName: 'C',
      });
      const input = { email: 'c@athar.test', activationCode, password: PASSWORD };

      const session = await auth.activate(input, 'ip');

      expect(session.account).toStrictEqual(account);
      expect(await accounts.get(account.id)).toMatchObject({
        activationCodeHash: null,
        activationExpiresAt: null,
      });
      expect((await failure(auth.activate(input, 'ip'))).code).toBe('ACTIVATION_INVALID');
      await auth.login({ email: 'c@athar.test', password: PASSWORD }, 'ip');
    });

    it('refuses a code after 72 hours, a wrong code and an unknown email the same way', async () => {
      const { clock, service, auth } = setup();
      const { activationCode } = await service.createCustomer({
        email: 'c@athar.test',
        displayName: 'C',
      });

      const wrong = await failure(
        auth.activate(
          { email: 'c@athar.test', activationCode: 'AAAAAAAAAA', password: PASSWORD },
          'ip',
        ),
      );
      const unknown = await failure(
        auth.activate({ email: 'x@athar.test', activationCode, password: PASSWORD }, 'ip'),
      );
      clock.advance(72 * HOUR);
      const expired = await failure(
        auth.activate({ email: 'c@athar.test', activationCode, password: PASSWORD }, 'ip'),
      );

      expect(unknown).toStrictEqual(wrong);
      expect(expired).toStrictEqual(wrong);
      expect(wrong.code).toBe('ACTIVATION_INVALID');
    });

    it('leaves the code usable when the session cannot be stored', async () => {
      const { service, auth, sessions } = setup();
      const { activationCode } = await service.createCustomer({
        email: 'c@athar.test',
        displayName: 'C',
      });
      const input = { email: 'c@athar.test', activationCode, password: PASSWORD };
      vi.spyOn(sessions, 'create').mockRejectedValueOnce(new Error('disk full'));

      await expect(auth.activate(input, 'ip')).rejects.toThrow('disk full');

      const session = await auth.activate(input, 'ip');
      await auth.authenticate(session.accessToken);
    });

    it('revokes the new session if the code was used meanwhile', async () => {
      const { service, auth, accounts, sessions } = setup();
      const { account, activationCode } = await service.createCustomer({
        email: 'c@athar.test',
        displayName: 'C',
      });
      // Another request consumes the code while this one stores its session.
      const create = sessions.create.bind(sessions);
      vi.spyOn(sessions, 'create').mockImplementationOnce(async (record) => {
        await create(record);
        await accounts.update(account.id, (current) => ({ ...current, activationCodeHash: null }));
      });

      expect(
        (
          await failure(
            auth.activate({ email: 'c@athar.test', activationCode, password: PASSWORD }, 'ip'),
          )
        ).code,
      ).toBe('ACTIVATION_INVALID');
      expect(sessions.list().every((session) => session.revokedAt !== null)).toBe(true);
    });

    it('stores only a hash of the code', async () => {
      const { service, accounts } = setup();
      const { account, activationCode } = await service.createCustomer({
        email: 'c@athar.test',
        displayName: 'C',
      });

      expect(JSON.stringify(await accounts.get(account.id))).not.toContain(activationCode);
    });
  });

  describe('admin passwords', () => {
    it('need 14 characters; a customer needs 10', async () => {
      const { service, auth } = setup();

      await expect(
        service.createAdmin({ email: 'a@athar.test', displayName: 'A', password: 'x'.repeat(13) }),
      ).rejects.toThrow('14 to 200');
      await service.createAdmin({
        email: 'a@athar.test',
        displayName: 'A',
        password: 'x'.repeat(14),
      });

      const { activationCode } = await service.createCustomer({
        email: 'c@athar.test',
        displayName: 'C',
      });
      await auth.activate(
        { email: 'c@athar.test', activationCode, password: 'x'.repeat(10) },
        'ip',
      );
    });
  });

  describe('logout and revocation', () => {
    it('ends one session on logout, and every session on revokeAllFor', async () => {
      const { service, auth } = setup();
      const admin = await service.createAdmin({
        email: 'a@athar.test',
        displayName: 'A',
        password: PASSWORD,
      });
      const login = () => auth.login({ email: 'a@athar.test', password: PASSWORD }, 'ip');
      const [one, two, three] = [await login(), await login(), await login()];

      await auth.logout((await auth.authenticate(one.accessToken)).sessionId);
      expect((await failure(auth.authenticate(one.accessToken))).code).toBe('SESSION_EXPIRED');
      expect((await failure(auth.refresh(one.refreshToken))).code).toBe('SESSION_EXPIRED');
      await auth.authenticate(two.accessToken);

      await auth.revokeAllFor(admin.id);
      for (const session of [two, three]) {
        expect((await failure(auth.authenticate(session.accessToken))).code).toBe(
          'SESSION_EXPIRED',
        );
      }
    });

    it('stores no token, only hashes', async () => {
      const { service, auth, sessions } = setup();
      await service.createAdmin({ email: 'a@athar.test', displayName: 'A', password: PASSWORD });
      const session = await auth.login({ email: 'a@athar.test', password: PASSWORD }, 'ip');
      const stored = JSON.stringify(sessions.list());

      expect(stored).not.toContain(session.accessToken);
      expect(stored).not.toContain(session.refreshToken);
    });
  });
});
