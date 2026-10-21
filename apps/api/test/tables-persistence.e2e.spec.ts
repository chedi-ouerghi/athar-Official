import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer, type AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { NestApplication } from '@nestjs/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, createConfiguredApp } from '../src/bootstrap.js';
import { StartupConfigurationError } from '../src/config/startup-configuration.error.js';
import { FakeMqttClient } from '../src/device/hardware/fake-mqtt-client.js';
import { JsonFileTableRepository } from '../src/tables/json-file-table.repository.js';
import { createTestConfig } from './create-test-config.js';
import { bearer, signIn } from './create-test-app.js';
import type { SessionResponse } from '@athar/contracts';

/**
 * The application wired to the real JSON-file repository, as `main.ts` builds
 * it: no repository override, so `createConfiguredApp` opens `TABLES_DATA_FILE`
 * itself. This is the path no other test takes.
 */
describe('tables persisted in TABLES_DATA_FILE', () => {
  let directory: string;
  let file: string;

  // Accounts and sessions go to a directory of their own, so `data` holds only the tables file.
  const config = (environment: Record<string, unknown> = {}) =>
    createTestConfig({
      TABLES_DATA_FILE: file,
      ACCOUNTS_DATA_FILE: join(directory, 'auth', 'accounts.json'),
      SESSIONS_DATA_FILE: join(directory, 'auth', 'sessions.json'),
      TABLE_ACCESS_DATA_FILE: join(directory, 'auth', 'table-access.json'),
      ...environment,
    });

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'athar-persistence-'));
    file = join(directory, 'data', 'tables.json');
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('creates the file and its directory on first start, empty', async () => {
    const app = await createConfiguredApp(config());

    try {
      expect(JSON.parse(await readFile(file, 'utf8'))).toStrictEqual({ version: 1, tables: [] });
    } finally {
      await app.close();
    }
  });

  it('keeps a table created over HTTP across a restart, and its owner keeps access', async () => {
    const first = await createConfiguredApp(config());
    let id: string;
    let owner: SessionResponse;

    try {
      owner = await signIn(first, 'customer');
      const created = await request(first.getHttpServer())
        .post('/api/v1/admin/tables')
        .set(bearer(await signIn(first)))
        .send({ displayName: 'Survivor', location: 'Hall', ownerAccountId: owner.account.id })
        .expect(201);

      id = (created.body as { id: string }).id;
    } finally {
      await first.close();
    }

    const second = await createConfiguredApp(config());

    try {
      // The accounts and sessions files persisted too, so the same session still works.
      const response = await request(second.getHttpServer())
        .get(`/api/v1/tables/${id}`)
        .set(bearer(owner))
        .expect(200);

      expect(response.body).toMatchObject({ id, displayName: 'Survivor', enabled: true });
    } finally {
      await second.close();
    }
  });

  it('keeps an update across a restart', async () => {
    const first = await createConfiguredApp(config());
    let id: string;

    try {
      const admin = bearer(await signIn(first));
      const created = await request(first.getHttpServer())
        .post('/api/v1/admin/tables')
        .set(admin)
        .send({ displayName: 'Before', location: 'Hall' });
      id = (created.body as { id: string }).id;

      await request(first.getHttpServer())
        .patch(`/api/v1/admin/tables/${id}`)
        .set(admin)
        .send({ enabled: false, displayName: 'After', plan: 'personalized', voiceAssistant: true })
        .expect(200);
    } finally {
      await first.close();
    }

    const second = await createConfiguredApp(config());

    try {
      const response = await request(second.getHttpServer())
        .get(`/api/v1/admin/tables/${id}`)
        .set(bearer(await signIn(second)))
        .expect(200);

      expect(response.body).toMatchObject({
        displayName: 'After',
        enabled: false,
        plan: 'personalized',
        voiceAssistant: true,
      });
    } finally {
      await second.close();
    }
  });

  it('holds the writer lock while running, and releases it when the application closes', async () => {
    const app = await createConfiguredApp(config());

    await expect(JsonFileTableRepository.open(file)).rejects.toBeInstanceOf(
      StartupConfigurationError,
    );
    await expect(createConfiguredApp(config())).rejects.toBeInstanceOf(StartupConfigurationError);

    await app.close();

    await (await JsonFileTableRepository.open(file)).close();
    expect(await readdir(join(directory, 'data'))).toStrictEqual(['tables.json']);
  });

  /** Start the application on a port another server already holds. */
  async function startOnTakenPort(): Promise<unknown> {
    const blocker = createServer();
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
    const { port } = blocker.address() as AddressInfo;

    try {
      return await createApp(config({ PORT: String(port) })).then(
        () => undefined,
        (error: unknown) => error,
      );
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
    }
  }

  it('releases the writer lock when the port is already in use', async () => {
    expect(await startOnTakenPort()).toMatchObject({ code: 'EADDRINUSE' });

    await (await JsonFileTableRepository.open(file)).close();
  });

  it('reports the port in use even if closing the application afterwards fails', async () => {
    const realClose = NestApplication.prototype.close;
    const close = vi
      .spyOn(NestApplication.prototype, 'close')
      .mockImplementationOnce(async function (this: NestApplication) {
        await realClose.call(this);
        throw new Error('close failed');
      });

    try {
      expect(await startOnTakenPort()).toMatchObject({ code: 'EADDRINUSE' });
      expect(close).toHaveBeenCalledTimes(1);
    } finally {
      close.mockRestore();
    }
  });

  it('refuses to start on a corrupted file, naming it, and leaves the file as it was', async () => {
    await createConfiguredApp(config()).then((app) => app.close());
    await writeFile(file, '{"version": 1, "tables": [ oops');

    const failure = await createConfiguredApp(config()).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(StartupConfigurationError);
    expect((failure as Error).message).toContain(file);
    expect(await readFile(file, 'utf8')).toBe('{"version": 1, "tables": [ oops');
    expect(await readdir(join(directory, 'data'))).toStrictEqual(['tables.json']);
  });

  it('releases the lock if the application fails to come up after opening the file', async () => {
    // A broker connection that cannot be set up fails the module graph, after the
    // data files were opened.
    class BrokenMqttClient extends FakeMqttClient {
      override on(): never {
        throw new StartupConfigurationError('The broker connection could not be set up.');
      }
    }

    const failure = await createConfiguredApp(config({ TABLE_MODE: 'hardware' }), {
      mqttClient: new BrokenMqttClient(),
    }).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(StartupConfigurationError);
    expect(await readdir(join(directory, 'data'))).toStrictEqual(['tables.json']);
    expect(await readdir(join(directory, 'auth'))).toStrictEqual([
      'accounts.json',
      'sessions.json',
      'table-access.json',
    ]);
  });

  it('keeps accounts and sessions across a restart, storing no secret', async () => {
    const first = await createConfiguredApp(config());
    let session: Awaited<ReturnType<typeof signIn>>;

    try {
      session = await signIn(first);
    } finally {
      await first.close();
    }

    const stored = await readFile(join(directory, 'auth', 'accounts.json'), 'utf8');
    const sessions = await readFile(join(directory, 'auth', 'sessions.json'), 'utf8');
    expect(stored).toContain(session.account.email);
    expect(stored).not.toContain('test-password');
    expect(sessions).not.toContain(session.accessToken);
    expect(sessions).not.toContain(session.refreshToken);

    const second = await createConfiguredApp(config());

    try {
      const me = await request(second.getHttpServer())
        .get('/api/v1/auth/me')
        .set(bearer(session))
        .expect(200);

      expect(me.body).toStrictEqual(session.account);
    } finally {
      await second.close();
    }
  });

  it('refuses to start while another process holds the accounts file', async () => {
    const app = await createConfiguredApp(config());

    try {
      const failure = await createConfiguredApp(
        config({ TABLES_DATA_FILE: join(directory, 'other.json') }),
      ).then(
        () => undefined,
        (error: unknown) => error,
      );

      expect(failure).toBeInstanceOf(StartupConfigurationError);
      expect((failure as Error).message).toContain('ACCOUNTS_DATA_FILE');
    } finally {
      await app.close();
    }

    // The failed start released the tables lock it had taken.
    expect(await readdir(directory)).not.toContain('other.json.lock');
  });
});
