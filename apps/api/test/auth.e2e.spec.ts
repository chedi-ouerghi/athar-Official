import type { NestExpressApplication } from '@nestjs/platform-express';
import { apiErrorResponseSchema, meResponseSchema, sessionResponseSchema } from '@athar/contracts';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AccountsService } from '../src/auth/accounts.service.js';
import {
  TEST_PASSWORD,
  bearer,
  createTestApp,
  createTimedApp,
  signIn,
  type TimedApp,
} from './create-test-app.js';

const AUTH = '/api/v1/auth';
const errorOf = (body: unknown) => apiErrorResponseSchema.parse(body).error;

describe('auth over HTTP', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());

  it('login, me, refresh, logout, then me is refused', async () => {
    const admin = await signIn(app);

    const login = await http()
      .post(`${AUTH}/login`)
      .send({ email: admin.account.email.toUpperCase(), password: TEST_PASSWORD })
      .expect(200);
    const session = sessionResponseSchema.parse(login.body);
    expect(session.account).toStrictEqual(admin.account);

    const me = await http().get(`${AUTH}/me`).set(bearer(session)).expect(200);
    expect(meResponseSchema.parse(me.body)).toStrictEqual(admin.account);

    const refreshed = sessionResponseSchema.parse(
      (
        await http()
          .post(`${AUTH}/refresh`)
          .send({ refreshToken: session.refreshToken })
          .expect(200)
      ).body,
    );
    await http().get(`${AUTH}/me`).set(bearer(refreshed)).expect(200);

    await http().post(`${AUTH}/logout`).set(bearer(refreshed)).expect(204);

    const after = await http().get(`${AUTH}/me`).set(bearer(refreshed)).expect(401);
    expect(errorOf(after.body).code).toBe('SESSION_EXPIRED');
    expect(after.headers['www-authenticate']).toBe('Bearer');
  });

  it('never returns a hash or a password', async () => {
    const admin = await signIn(app);
    const login = await http()
      .post(`${AUTH}/login`)
      .send({ email: admin.account.email, password: TEST_PASSWORD });
    const me = await http().get(`${AUTH}/me`).set(bearer(admin));

    for (const body of [login.body, me.body]) {
      expect(JSON.stringify(body)).not.toMatch(/Hash|scrypt|password/i);
    }
  });

  it('answers 401 UNAUTHORIZED with no token, and with an unknown one', async () => {
    for (const call of [
      () => http().get(`${AUTH}/me`),
      () => http().get(`${AUTH}/me`).set('Authorization', 'Bearer not-a-token'),
      () => http().post(`${AUTH}/logout`),
    ]) {
      const response = await call().expect(401);

      expect(errorOf(response.body).code).toBe('UNAUTHORIZED');
      expect(response.headers['www-authenticate']).toBe('Bearer');
    }
  });

  it('answers 403 FORBIDDEN to a customer on an admin route', async () => {
    const customer = await signIn(app, 'customer');

    const response = await http().get('/api/v1/admin/tables').set(bearer(customer)).expect(403);

    expect(errorOf(response.body).code).toBe('FORBIDDEN');
  });

  it('revokes the session when a refresh token is reused', async () => {
    const admin = await signIn(app);
    const next = sessionResponseSchema.parse(
      (await http().post(`${AUTH}/refresh`).send({ refreshToken: admin.refreshToken }).expect(200))
        .body,
    );
    await http().get(`${AUTH}/me`).set(bearer(next)).expect(200);

    const reuse = await http()
      .post(`${AUTH}/refresh`)
      .send({ refreshToken: admin.refreshToken })
      .expect(401);

    expect(errorOf(reuse.body).code).toBe('SESSION_EXPIRED');

    // The whole session is gone: the newest pair stops working too.
    const me = await http().get(`${AUTH}/me`).set(bearer(next)).expect(401);
    expect(errorOf(me.body).code).toBe('SESSION_EXPIRED');
    const refresh = await http()
      .post(`${AUTH}/refresh`)
      .send({ refreshToken: next.refreshToken })
      .expect(401);
    expect(errorOf(refresh.body).code).toBe('SESSION_EXPIRED');
  });

  describe('login failures', () => {
    it('gives the same answer for an unknown email and a wrong password', async () => {
      const admin = await signIn(app);
      const [unknown, wrong] = await Promise.all([
        http().post(`${AUTH}/login`).send({ email: 'nobody@athar.test', password: TEST_PASSWORD }),
        http().post(`${AUTH}/login`).send({ email: admin.account.email, password: 'wrong-one' }),
      ]);

      expect(unknown.status).toBe(401);
      expect(wrong.status).toBe(401);
      expect(errorOf(unknown.body).code).toBe('INVALID_CREDENTIALS');
      expect(errorOf(unknown.body).message).toBe(errorOf(wrong.body).message);
    });

    it('answers 429 TOO_MANY_REQUESTS to the 6th attempt after 5 failures', async () => {
      const admin = await signIn(app);
      const attempt = (password: string) =>
        http().post(`${AUTH}/login`).send({ email: admin.account.email, password });

      for (let failure = 0; failure < 5; failure += 1) {
        await attempt('wrong-password').expect(401);
      }

      const response = await attempt(TEST_PASSWORD).expect(429);
      expect(errorOf(response.body).code).toBe('TOO_MANY_REQUESTS');
    });

    it('answers VALIDATION_FAILED for a malformed body, never echoing the password', async () => {
      const response = await http()
        .post(`${AUTH}/login`)
        .send({ email: 'not-an-email', password: 'secret-value-123' })
        .expect(400);

      expect(errorOf(response.body).code).toBe('VALIDATION_FAILED');
      expect(JSON.stringify(response.body)).not.toContain('secret-value-123');
    });
  });

  describe('activation', () => {
    it('activates with the code, signs in, and refuses the code a second time', async () => {
      const { account, activationCode } = await app
        .get(AccountsService)
        .createCustomer({ email: 'new-customer@athar.test', displayName: 'Sara' });
      const body = {
        email: 'New-Customer@athar.test',
        activationCode: activationCode.toLowerCase(),
        password: 'my-new-password',
      };

      const first = await http().post(`${AUTH}/activate`).send(body).expect(200);
      const session = sessionResponseSchema.parse(first.body);
      expect(session.account).toStrictEqual(account);
      await http().get(`${AUTH}/me`).set(bearer(session)).expect(200);

      const second = await http().post(`${AUTH}/activate`).send(body).expect(400);
      expect(errorOf(second.body).code).toBe('ACTIVATION_INVALID');

      await http()
        .post(`${AUTH}/login`)
        .send({ email: account.email, password: 'my-new-password' })
        .expect(200);
    });

    it('needs a password of at least 10 characters', async () => {
      const response = await http()
        .post(`${AUTH}/activate`)
        .send({ email: 'a@athar.test', activationCode: 'ABCDEFGHJK', password: 'short' })
        .expect(400);

      expect(errorOf(response.body).code).toBe('VALIDATION_FAILED');
    });
  });
});

describe('session expiry over HTTP', () => {
  let timed: TimedApp | undefined;

  afterEach(async () => {
    await timed?.app.close();
    timed = undefined;
  });

  it('answers SESSION_EXPIRED for an access token older than 15 minutes, until a refresh', async () => {
    const current = await createTimedApp();
    timed = current;
    const http = () => request(current.app.getHttpServer());
    const admin = await signIn(current.app);

    await http().get('/api/v1/admin/tables').set(bearer(admin)).expect(200);
    current.clock.advanceSeconds(15 * 60);

    const expired = await http().get('/api/v1/admin/tables').set(bearer(admin)).expect(401);
    expect(errorOf(expired.body).code).toBe('SESSION_EXPIRED');

    const refreshed = sessionResponseSchema.parse(
      (
        await http()
          .post('/api/v1/auth/refresh')
          .send({ refreshToken: admin.refreshToken })
          .expect(200)
      ).body,
    );
    await http().get('/api/v1/admin/tables').set(bearer(refreshed)).expect(200);
  });
});

describe('the client IP behind a proxy (TRUST_PROXY)', () => {
  /** 5 wrong guesses from one forwarded address, then one from another. */
  async function sixthFromAnotherAddress(environment: Record<string, unknown>): Promise<number> {
    const app = await createTestApp(environment);

    try {
      const admin = await signIn(app);
      const guess = (forwardedFor: string) =>
        request(app.getHttpServer())
          .post(`${AUTH}/login`)
          .set('X-Forwarded-For', forwardedFor)
          .send({ email: admin.account.email, password: 'wrong-password' });

      for (let attempt = 0; attempt < 5; attempt += 1) {
        await guess('203.0.113.1').expect(401);
      }

      return (await guess('203.0.113.2')).status;
    } finally {
      await app.close();
    }
  }

  it('ignores X-Forwarded-For by default, so a client cannot pick a fresh address', async () => {
    expect(await sixthFromAnotherAddress({})).toBe(429);
  });

  it('uses the forwarded address behind a trusted proxy', async () => {
    expect(await sixthFromAnotherAddress({ TRUST_PROXY: '1' })).toBe(401);
  });
});
