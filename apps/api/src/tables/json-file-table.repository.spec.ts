import { Logger } from '@nestjs/common';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { hostname, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DISABLED_TABLE, ENABLED_TABLE } from '../../test/table-fixtures.js';
import { StartupConfigurationError } from '../config/startup-configuration.error.js';
import {
  JsonFileTableRepository,
  TABLES_FILE_VERSION,
  type FileOperations,
} from './json-file-table.repository.js';

let directory: string;
let file: string;
const opened: JsonFileTableRepository[] = [];

/** Open and remember the repository so the test directory can be removed afterwards. */
async function open(
  target = file,
  options?: Parameters<typeof JsonFileTableRepository.open>[1],
): Promise<JsonFileTableRepository> {
  const repository = await JsonFileTableRepository.open(target, options);
  opened.push(repository);

  return repository;
}

const document = (tables: unknown[], version: unknown = TABLES_FILE_VERSION) =>
  JSON.stringify({ version, tables }, null, 2) + '\n';

async function filesIn(path: string): Promise<string[]> {
  return (await readdir(path)).sort();
}

describe('JsonFileTableRepository', () => {
  beforeAll(() => Logger.overrideLogger(false));
  afterAll(() => Logger.overrideLogger(['log', 'error', 'warn']));

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'athar-json-repo-'));
    file = join(directory, 'tables.json');
  });

  afterEach(async () => {
    await Promise.all(opened.splice(0).map((repository) => repository.close()));
    await rm(directory, { recursive: true, force: true });
  });

  describe('a missing file', () => {
    it('is created, empty and valid, on first open', async () => {
      const repository = await open();

      expect(await repository.list()).toStrictEqual([]);
      expect(JSON.parse(await readFile(file, 'utf8'))).toStrictEqual({
        version: TABLES_FILE_VERSION,
        tables: [],
      });
    });

    it('is created together with a missing directory', async () => {
      const nested = join(directory, 'a', 'b', 'tables.json');

      await open(nested);

      expect((await stat(nested)).isFile()).toBe(true);
    });

    it('is left missing by a read-only open, which also leaves nothing behind', async () => {
      const repository = await open(file, { readOnly: true });

      expect(await repository.list()).toStrictEqual([]);
      expect(await filesIn(directory)).toStrictEqual([]);
    });
  });

  describe('a valid file', () => {
    it('is loaded with its tables in order', async () => {
      await writeFile(file, document([ENABLED_TABLE, DISABLED_TABLE]));

      const repository = await open();

      expect(await repository.list()).toStrictEqual([ENABLED_TABLE, DISABLED_TABLE]);
    });

    it('keeps what was written when it is opened again', async () => {
      const first = await open();
      await first.create(ENABLED_TABLE);
      await first.update('table-001', { enabled: false, updatedAt: '2026-05-05T00:00:00.000Z' });
      await first.close();

      const second = await open();

      expect(await second.get('table-001')).toStrictEqual({
        ...ENABLED_TABLE,
        enabled: false,
        updatedAt: '2026-05-05T00:00:00.000Z',
      });
    });

    it('writes readable, newline-terminated, versioned JSON', async () => {
      const repository = await open();
      await repository.create(ENABLED_TABLE);

      const text = await readFile(file, 'utf8');

      expect(text.endsWith('\n')).toBe(true);
      expect(text).toContain('\n  "version": 1,');
      expect(JSON.parse(text)).toStrictEqual({ version: 1, tables: [ENABLED_TABLE] });
    });
  });

  describe('a corrupted or invalid file', () => {
    it.each([
      ['is not JSON', '{ this is not json', /not valid JSON/],
      ['is truncated mid-document', '{"version": 1, "tables": [{"id": "tab', /not valid JSON/],
      ['is empty', '', /not valid JSON/],
      ['is a JSON array', '[]', /expected structure/],
      ['has no tables list', '{"version": 1}', /expected structure/],
      [
        'has a table with a bad id',
        document([{ ...ENABLED_TABLE, id: 'Not Valid' }]),
        /expected structure.*tables\.0\.id/,
      ],
      [
        'has a table missing a field',
        document([{ id: 'table-001', displayName: 'x' }]),
        /expected structure/,
      ],
      [
        'has duplicate ids',
        document([ENABLED_TABLE, { ...DISABLED_TABLE, id: ENABLED_TABLE.id }]),
        /duplicate table id table-001/,
      ],
      ['has a future version', document([], 2), /version 2.*only understands version 1/],
      ['has version 0', document([], 0), /version 0.*only understands version 1/],
    ])(
      'refuses to start when the file %s, and does not touch it',
      async (_label, text, message) => {
        await writeFile(file, text);

        const failure = await open().then(
          () => undefined,
          (error: unknown) => error,
        );

        expect(failure).toBeInstanceOf(StartupConfigurationError);
        expect((failure as StartupConfigurationError).message).toMatch(message);
        expect((failure as StartupConfigurationError).message).toContain(file);
        expect((failure as StartupConfigurationError).message).toContain('has not been modified');
        expect(await readFile(file, 'utf8')).toBe(text);
      },
    );

    it('also refuses a read-only open, without touching the file', async () => {
      await writeFile(file, 'garbage');

      await expect(open(file, { readOnly: true })).rejects.toBeInstanceOf(
        StartupConfigurationError,
      );
      expect(await readFile(file, 'utf8')).toBe('garbage');
    });

    it('does not leave its lock behind when it refuses', async () => {
      await writeFile(file, 'garbage');
      await open().catch(() => undefined);

      expect(await filesIn(directory)).toStrictEqual(['tables.json']);
    });

    it('refuses a path that is a directory', async () => {
      await mkdir(file);

      await expect(open()).rejects.toBeInstanceOf(StartupConfigurationError);
    });
  });

  describe('atomic writes', () => {
    /** A rename that records its arguments and then really renames. */
    function spyingOperations(): { operations: FileOperations; calls: [string, string][] } {
      const calls: [string, string][] = [];
      const operations: FileOperations = {
        rename: async (from, to) => {
          calls.push([from, to]);
          const { rename } = await import('node:fs/promises');
          await rename(from, to);
        },
      };

      return { operations, calls };
    }

    it('writes to a temporary file in the same directory, then renames it over the file', async () => {
      const { operations, calls } = spyingOperations();
      const repository = await open(file, { fileOperations: operations });

      await repository.create(ENABLED_TABLE);

      expect(calls).toHaveLength(2); // the empty file at first open, then this write
      const [from, to] = calls.at(-1) ?? ['', ''];
      expect(to).toBe(file);
      expect(dirname(from)).toBe(dirname(file));
      expect(from).toMatch(/tables\.json\.\d+\.[0-9a-f]+\.tmp$/);
    });

    it('leaves no temporary file behind after a successful write', async () => {
      const repository = await open();

      await repository.create(ENABLED_TABLE);
      await repository.update('table-001', { enabled: false, updatedAt: 'x' });

      expect(await filesIn(directory)).toStrictEqual(['tables.json', 'tables.json.lock']);
    });

    describe('when the rename fails', () => {
      const failing: FileOperations = {
        rename: () => Promise.reject(Object.assign(new Error('disk on fire'), { code: 'EIO' })),
      };

      async function openThatFailsAfterFirstWrite(): Promise<{
        repository: JsonFileTableRepository;
        fail: () => void;
      }> {
        let broken = false;
        const { rename } = await import('node:fs/promises');
        const repository = await open(file, {
          fileOperations: {
            rename: (from, to) => (broken ? failing.rename(from, to) : rename(from, to)),
          },
        });

        return {
          repository,
          fail: () => {
            broken = true;
          },
        };
      }

      it('leaves the previous file byte-for-byte intact and no temporary file', async () => {
        const { repository, fail } = await openThatFailsAfterFirstWrite();
        await repository.create(ENABLED_TABLE);
        const before = await readFile(file, 'utf8');

        fail();

        await expect(repository.create(DISABLED_TABLE)).rejects.toThrow('disk on fire');
        expect(await readFile(file, 'utf8')).toBe(before);
        expect(await filesIn(directory)).toStrictEqual(['tables.json', 'tables.json.lock']);
      });

      it('leaves memory in agreement with the disk', async () => {
        const { repository, fail } = await openThatFailsAfterFirstWrite();
        await repository.create(ENABLED_TABLE);

        fail();

        await expect(repository.create(DISABLED_TABLE)).rejects.toThrow();
        await expect(
          repository.update('table-001', { enabled: false, updatedAt: 'x' }),
        ).rejects.toThrow();

        expect(await repository.list()).toStrictEqual([ENABLED_TABLE]);
      });

      it('refuses to start, and leaves no lock or temporary file, if it cannot create the file', async () => {
        const failure = await open(file, { fileOperations: failing }).then(
          () => undefined,
          (error: unknown) => error,
        );

        expect((failure as Error).message).toContain('disk on fire');
        expect(await filesIn(directory)).toStrictEqual([]);
      });
    });

    it('retries a rename that fails transiently, as Windows does', async () => {
      let attempts = 0;
      const { rename } = await import('node:fs/promises');
      const repository = await open(file, {
        fileOperations: {
          rename: async (from, to) => {
            attempts += 1;
            if (attempts === 2 || attempts === 3) {
              throw Object.assign(new Error('locked'), { code: 'EPERM' });
            }
            await rename(from, to);
          },
        },
      });

      await repository.create(ENABLED_TABLE); // attempts 2 and 3 fail, 4 succeeds

      expect(attempts).toBe(4);
      expect(
        (JSON.parse(await readFile(file, 'utf8')) as { tables: unknown[] }).tables,
      ).toHaveLength(1);
    });

    it('gives up on a rename that keeps failing transiently', async () => {
      let broken = false;
      const { rename } = await import('node:fs/promises');
      const repository = await open(file, {
        fileOperations: {
          rename: (from, to) =>
            broken
              ? Promise.reject(Object.assign(new Error('locked'), { code: 'EBUSY' }))
              : rename(from, to),
        },
      });
      broken = true;

      await expect(repository.create(ENABLED_TABLE)).rejects.toThrow('locked');
      expect(await repository.list()).toStrictEqual([]);
    });

    it('removes temporary files a crashed writer left behind, and never reads them', async () => {
      await writeFile(file, document([ENABLED_TABLE]));
      await writeFile(`${file}.4242.deadbeef.tmp`, '{ half a document');
      await writeFile(join(directory, 'unrelated.tmp'), 'keep me');

      const repository = await open();

      expect(await repository.list()).toStrictEqual([ENABLED_TABLE]);
      expect(await filesIn(directory)).toStrictEqual([
        'tables.json',
        'tables.json.lock',
        'unrelated.tmp',
      ]);
    });

    it('applies concurrent changes one at a time, none lost', async () => {
      const repository = await open();
      const ids = Array.from(
        { length: 25 },
        (_, index) => `table-${String(index).padStart(3, '0')}`,
      );

      await Promise.all(ids.map((id) => repository.create({ ...ENABLED_TABLE, id })));

      expect((await repository.list()).map((table) => table.id)).toStrictEqual(ids);

      const onDisk = JSON.parse(await readFile(file, 'utf8')) as { tables: { id: string }[] };
      expect(onDisk.tables.map((table) => table.id)).toStrictEqual(ids);
    });

    it('does not let one failed change stop the queue', async () => {
      const repository = await open();
      await repository.create(ENABLED_TABLE);

      const results = await Promise.allSettled([
        repository.create(ENABLED_TABLE), // duplicate: rejected
        repository.create(DISABLED_TABLE), // must still go through
      ]);

      expect(results.map((result) => result.status)).toStrictEqual(['rejected', 'fulfilled']);
      expect(await repository.list()).toHaveLength(2);
    });
  });

  describe('the writer lock', () => {
    it('stops a second writer, naming the process that holds it', async () => {
      await open();

      const failure = await open().then(
        () => undefined,
        (error: unknown) => error,
      );

      expect(failure).toBeInstanceOf(StartupConfigurationError);
      expect((failure as StartupConfigurationError).message).toContain(
        `open for writing by process ${process.pid}`,
      );
      expect((failure as StartupConfigurationError).message).toContain('admin endpoints');
    });

    it('lets readers in while a writer holds it', async () => {
      const writer = await open();
      await writer.create(ENABLED_TABLE);

      const reader = await open(file, { readOnly: true });

      expect(await reader.list()).toStrictEqual([ENABLED_TABLE]);
    });

    it('is released on close, so the next writer can open', async () => {
      const first = await open();
      await first.close();

      await expect(open()).resolves.toBeInstanceOf(JsonFileTableRepository);
    });

    it('is released by onModuleDestroy, which Nest calls when the application closes', async () => {
      const first = await open();
      await first.onModuleDestroy();

      expect(await filesIn(directory)).toStrictEqual(['tables.json']);
    });

    it('takes over a lock left by a process that no longer exists', async () => {
      await writeFile(`${file}.lock`, '999999999');

      await expect(open()).resolves.toBeInstanceOf(JsonFileTableRepository);
    });

    it.each([
      ['this host', () => `${process.pid}:${hostname()}`],
      ['an older build (pid only)', () => String(process.pid)],
    ])(
      'takes over a lock from %s naming its own pid that it does not hold, as after a container restart as PID 1',
      async (_label, content) => {
        await writeFile(`${file}.lock`, content());

        await expect(open()).resolves.toBeInstanceOf(JsonFileTableRepository);
        expect(await readFile(`${file}.lock`, 'utf8')).toBe(`${process.pid}:${hostname()}`);
      },
    );

    it('refuses a lock naming its own pid from a different host, which it cannot check', async () => {
      const lock = `${process.pid}:another-container`;
      await writeFile(`${file}.lock`, lock);

      const failure = await open().then(
        () => undefined,
        (error: unknown) => error,
      );

      expect(failure).toBeInstanceOf(StartupConfigurationError);
      expect((failure as StartupConfigurationError).message).toContain('on host another-container');
      expect(await readFile(`${file}.lock`, 'utf8')).toBe(lock);
    });

    it('rejects writes after close', async () => {
      const repository = await open();
      await repository.close();

      await expect(repository.create(ENABLED_TABLE)).rejects.toThrow('closed');
      await expect(
        repository.update('table-001', { enabled: false, updatedAt: 'x' }),
      ).rejects.toThrow('closed');
      expect(await filesIn(directory)).toStrictEqual(['tables.json']);
    });

    it('refuses a lock file that names no process, and says how to clear it', async () => {
      await writeFile(`${file}.lock`, 'who knows');

      const failure = await open().then(
        () => undefined,
        (error: unknown) => error,
      );

      expect((failure as StartupConfigurationError).message).toContain('delete the lock file');
    });

    it('refuses writes on a read-only repository', async () => {
      await writeFile(file, document([ENABLED_TABLE]));
      const reader = await open(file, { readOnly: true });

      await expect(reader.create(DISABLED_TABLE)).rejects.toThrow('read-only');
      await expect(reader.update('table-001', { enabled: false, updatedAt: 'x' })).rejects.toThrow(
        'read-only',
      );
    });
  });
});
