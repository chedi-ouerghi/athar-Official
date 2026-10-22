import type * as FsPromises from 'node:fs/promises';
import { mkdir, mkdtemp, open, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { DIRECTORY_MODE, FILE_MODE, JsonFileStore } from './json-file-store.js';

// The real calls, wrapped so the mode each is given can be checked on any OS.
vi.mock('node:fs/promises', async (importOriginal) => {
  const real = await importOriginal<typeof FsPromises>();

  return { ...real, mkdir: vi.fn(real.mkdir), open: vi.fn(real.open) };
});

const options = {
  setting: 'TEST_FILE',
  key: 'items',
  version: 1,
  schema: z.array(z.object({ id: z.string() })),
  busyHint: 'busy',
};

describe('JsonFileStore file permissions', () => {
  let directory: string;
  let file: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'athar-store-'));
    file = join(directory, 'nested', 'items.json');
    vi.mocked(open).mockClear();
    vi.mocked(mkdir).mockClear();
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('creates the directory 0700 and the lock and temporary files 0600', async () => {
    const store = await JsonFileStore.open(file, options);
    await store.change(() => ({ next: [{ id: 'a' }], result: undefined }));
    await store.close();

    expect(vi.mocked(mkdir)).toHaveBeenCalledWith(join(directory, 'nested'), {
      recursive: true,
      mode: DIRECTORY_MODE,
    });
    const writes = vi
      .mocked(open)
      .mock.calls.filter(([, flags]) => flags === 'w' || flags === 'wx');
    expect(writes.length).toBeGreaterThanOrEqual(3); // the lock, the empty file, the change
    for (const [, , mode] of writes) {
      expect(mode).toBe(FILE_MODE);
    }
  });

  it.skipIf(process.platform === 'win32')('leaves owner-only modes on disk (POSIX)', async () => {
    const store = await JsonFileStore.open(file, options);

    try {
      expect((await stat(file)).mode & 0o777).toBe(0o600);
      expect((await stat(`${file}.lock`)).mode & 0o777).toBe(0o600);
      expect((await stat(join(directory, 'nested'))).mode & 0o777).toBe(0o700);
    } finally {
      await store.close();
    }
  });
});
