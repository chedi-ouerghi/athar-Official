import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createConfiguredApp } from '../src/bootstrap.js';
import { StartupConfigurationError } from '../src/config/startup-configuration.error.js';
import { JsonFileTableRepository } from '../src/tables/json-file-table.repository.js';
import { createTestConfig } from './create-test-config.js';
import { TEST_ADMIN_KEY } from './create-test-app.js';

/**
 * The application wired to the real JSON-file repository, as `main.ts` builds
 * it: no repository override, so `createConfiguredApp` opens `TABLES_DATA_FILE`
 * itself. This is the path no other test takes.
 */
describe('tables persisted in TABLES_DATA_FILE', () => {
  let directory: string;
  let file: string;

  const config = () => createTestConfig({ ADMIN_API_KEY: TEST_ADMIN_KEY, TABLES_DATA_FILE: file });

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

  it('keeps a table created over HTTP across a restart', async () => {
    const first = await createConfiguredApp(config());
    let id: string;

    try {
      const created = await request(first.getHttpServer())
        .post('/api/v1/admin/tables')
        .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
        .send({ displayName: 'Survivor', location: 'Hall' })
        .expect(201);

      id = (created.body as { id: string }).id;
    } finally {
      await first.close();
    }

    const second = await createConfiguredApp(config());

    try {
      const response = await request(second.getHttpServer())
        .get(`/api/v1/tables/${id}`)
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
      const created = await request(first.getHttpServer())
        .post('/api/v1/admin/tables')
        .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
        .send({ displayName: 'Before', location: 'Hall' });
      id = (created.body as { id: string }).id;

      await request(first.getHttpServer())
        .patch(`/api/v1/admin/tables/${id}`)
        .set('Authorization', `Bearer ${TEST_ADMIN_KEY}`)
        .send({ enabled: false, displayName: 'After' })
        .expect(200);
    } finally {
      await first.close();
    }

    const second = await createConfiguredApp(config());

    try {
      const response = await request(second.getHttpServer())
        .get(`/api/v1/tables/${id}`)
        .expect(200);

      expect(response.body).toMatchObject({ displayName: 'After', enabled: false });
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
    const failure = await createConfiguredApp(
      createTestConfig({
        ADMIN_API_KEY: TEST_ADMIN_KEY,
        TABLES_DATA_FILE: file,
        TABLE_MODE: 'hardware',
      }),
    ).then(
      () => undefined,
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(StartupConfigurationError);
    expect(await readdir(join(directory, 'data'))).toStrictEqual(['tables.json']);
  });
});
