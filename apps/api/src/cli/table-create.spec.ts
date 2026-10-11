import { Logger } from '@nestjs/common';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { adminTableSchema, tableIdSchema } from '@athar/contracts';
import { InMemoryTableRepository } from '../tables/in-memory-table.repository.js';
import { JsonFileTableRepository } from '../tables/json-file-table.repository.js';
import type { CliIo } from './cli-io.js';
import { TABLE_CREATE_USAGE, parseTableCreateArguments, runTableCreate } from './table-create.js';

function capture(): { io: CliIo; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];

  return { io: { out: (text) => out.push(text), err: (text) => err.push(text) }, out, err };
}

const BASE = 'https://app.athar.example';

describe('parseTableCreateArguments', () => {
  it('reads the name and location, enabled by default', () => {
    expect(
      parseTableCreateArguments(['--name', 'Main hall', '--location', 'Ground floor']),
    ).toStrictEqual({ displayName: 'Main hall', location: 'Ground floor', enabled: true });
  });

  it('reads --disabled', () => {
    expect(
      parseTableCreateArguments(['--location', 'x', '--name', 'y', '--disabled']).enabled,
    ).toBe(false);
  });

  it('trims the text, exactly as the HTTP body does', () => {
    expect(
      parseTableCreateArguments(['--name', '  Hall ', '--location', ' Floor 1  ']),
    ).toMatchObject({
      displayName: 'Hall',
      location: 'Floor 1',
    });
  });

  it.each([
    ['no arguments', [], /displayName/],
    ['no location', ['--name', 'x'], /location/],
    ['no name', ['--location', 'x'], /displayName/],
    ['a blank name', ['--name', '   ', '--location', 'x'], /displayName/],
    ['an oversized name', ['--name', 'x'.repeat(101), '--location', 'y'], /displayName/],
    ['--name with no value', ['--name'], /--name needs a value/],
    ['--name followed by an option', ['--name', '--disabled'], /--name needs a value/],
    [
      'an unknown option',
      ['--name', 'x', '--location', 'y', '--colour'],
      /Unknown option --colour/,
    ],
    ['a stray argument', ['oops'], /Unexpected argument oops/],
  ])('rejects %s', (_label, argv, message) => {
    expect(() => parseTableCreateArguments(argv)).toThrow(message);
  });
});

describe('runTableCreate (in memory)', () => {
  it('registers the table and prints its id, details and link', async () => {
    const repository = new InMemoryTableRepository();
    const { io, out, err } = capture();

    const code = await runTableCreate(['--name', 'Main hall', '--location', 'Ground floor'], {
      config: { publicLinkBaseUrl: BASE, tablesDataFile: '/unused' },
      io,
      openRepository: () => Promise.resolve(repository),
    });

    const [table] = await repository.list();

    expect(code).toBe(0);
    expect(err).toStrictEqual([]);
    expect(table).toBeDefined();
    expect(adminTableSchema.safeParse(table).success).toBe(true);
    expect(tableIdSchema.safeParse(table?.id).success).toBe(true);
    expect(out[0]).toBe(`Registered table ${table?.id}`);
    expect(out).toContain(`  link:      ${BASE}/t/${table?.id}`);
    expect(out.at(-1)).toBe(`Next: pnpm --filter @athar/api table:qr ${table?.id}`);
  });

  it('can register a disabled table', async () => {
    const repository = new InMemoryTableRepository();

    await runTableCreate(['--name', 'x', '--location', 'y', '--disabled'], {
      config: { publicLinkBaseUrl: undefined, tablesDataFile: '/unused' },
      io: capture().io,
      openRepository: () => Promise.resolve(repository),
    });

    expect((await repository.list())[0]?.enabled).toBe(false);
  });

  it('uses the development link when no origin is configured', async () => {
    const { io, out } = capture();

    await runTableCreate(['--name', 'x', '--location', 'y'], {
      config: { publicLinkBaseUrl: undefined, tablesDataFile: '/unused' },
      io,
      openRepository: () => Promise.resolve(new InMemoryTableRepository()),
    });

    expect(out.find((line) => line.includes('link:'))).toMatch(/link: {6}athar:\/\/t\//);
  });

  it.each([
    ['no arguments', []],
    ['an invalid table', ['--name', ' ', '--location', 'y']],
    ['an unknown option', ['--bogus']],
  ])('exits 2, prints the usage and registers nothing for %s', async (_label, argv) => {
    const repository = new InMemoryTableRepository();
    const { io, err } = capture();

    const code = await runTableCreate(argv, {
      config: { publicLinkBaseUrl: BASE, tablesDataFile: '/unused' },
      io,
      openRepository: () => Promise.resolve(repository),
    });

    expect(code).toBe(2);
    expect(err.at(-1)).toBe(TABLE_CREATE_USAGE);
    expect(await repository.list()).toStrictEqual([]);
  });

  it('prints the usage and exits 0 for --help', async () => {
    const { io, out } = capture();

    expect(
      await runTableCreate(['--help'], {
        config: { publicLinkBaseUrl: BASE, tablesDataFile: '/unused' },
        io,
      }),
    ).toBe(0);
    expect(out).toStrictEqual([TABLE_CREATE_USAGE]);
  });
});

describe('runTableCreate (JSON file)', () => {
  let directory: string;
  let file: string;
  const config = () => ({ publicLinkBaseUrl: BASE, tablesDataFile: file });

  beforeAll(() => Logger.overrideLogger(false));
  afterAll(() => Logger.overrideLogger(['log', 'error', 'warn']));

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'athar-create-'));
    file = join(directory, 'data', 'tables.json');
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('writes the table to the file, where the API will read it', async () => {
    const { io, out } = capture();

    const code = await runTableCreate(['--name', 'Main hall', '--location', 'Ground floor'], {
      config: config(),
      io,
    });

    const stored = JSON.parse(await readFile(file, 'utf8')) as { tables: { id: string }[] };

    expect(code).toBe(0);
    expect(stored.tables).toHaveLength(1);
    expect(out[0]).toBe(`Registered table ${stored.tables[0]?.id}`);

    const reader = await JsonFileTableRepository.open(file, { readOnly: true });
    expect(await reader.get(stored.tables[0]?.id ?? '')).toMatchObject({
      displayName: 'Main hall',
      enabled: true,
    });
  });

  it('adds to the tables already there', async () => {
    for (const name of ['One', 'Two', 'Three']) {
      await runTableCreate(['--name', name, '--location', 'Hall'], {
        config: config(),
        io: capture().io,
      });
    }

    const reader = await JsonFileTableRepository.open(file, { readOnly: true });

    expect((await reader.list()).map((table) => table.displayName)).toStrictEqual([
      'One',
      'Two',
      'Three',
    ]);
  });

  it('refuses while another process holds the file for writing, and changes nothing', async () => {
    const running = await JsonFileTableRepository.open(file);
    const { io, err } = capture();

    try {
      const code = await runTableCreate(['--name', 'x', '--location', 'y'], {
        config: config(),
        io,
      });

      expect(code).toBe(1);
      expect(err.join('\n')).toContain('open for writing');
      expect(err.join('\n')).toContain('stop the API');
      expect(await running.list()).toStrictEqual([]);
    } finally {
      await running.close();
    }
  });

  it('releases the lock when it is done, so the API can start afterwards', async () => {
    await runTableCreate(['--name', 'x', '--location', 'y'], {
      config: config(),
      io: capture().io,
    });

    await (await JsonFileTableRepository.open(file)).close();
  });

  it('refuses a corrupted file instead of overwriting it', async () => {
    await (await JsonFileTableRepository.open(file)).close();
    const { writeFile } = await import('node:fs/promises');
    await writeFile(file, 'not json');
    const { io, err } = capture();

    const code = await runTableCreate(['--name', 'x', '--location', 'y'], { config: config(), io });

    expect(code).toBe(1);
    expect(err.join('\n')).toContain('not valid JSON');
    expect(await readFile(file, 'utf8')).toBe('not json');
  });
});
