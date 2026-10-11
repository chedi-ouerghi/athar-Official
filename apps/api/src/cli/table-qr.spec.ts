import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DISABLED_TABLE, ENABLED_TABLE } from '../../test/table-fixtures.js';
import { InMemoryTableRepository } from '../tables/in-memory-table.repository.js';
import type { CliIo } from './cli-io.js';
import { QR_MIN_PNG_PIXELS, writeQrFiles } from './qr-files.js';
import { TABLE_QR_USAGE, parseTableQrArguments, runTableQr } from './table-qr.js';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let directory: string;

function capture(): { io: CliIo; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];

  return { io: { out: (text) => out.push(text), err: (text) => err.push(text) }, out, err };
}

/** `null` means no origin is configured (the development case). */
function setup(baseUrl: string | null = 'https://app.athar.example') {
  const io = capture();
  const repository = new InMemoryTableRepository([ENABLED_TABLE, DISABLED_TABLE]);
  const dependencies = {
    config: { publicLinkBaseUrl: baseUrl ?? undefined, tablesDataFile: '/data/tables.json' },
    io: io.io,
    openRepository: () => Promise.resolve(repository),
  };

  return { ...io, dependencies };
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'athar-qr-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('parseTableQrArguments', () => {
  it('reads the table id, with the defaults', () => {
    expect(parseTableQrArguments(['table-001'])).toStrictEqual({
      tableId: 'table-001',
      outputDirectory: './qr-codes',
      verify: true,
    });
  });

  it('reads --out and --no-verify in any order', () => {
    expect(parseTableQrArguments(['--no-verify', 'table-001', '--out', 'somewhere'])).toStrictEqual(
      {
        tableId: 'table-001',
        outputDirectory: 'somewhere',
        verify: false,
      },
    );
  });

  it.each([
    ['no table id', [], /table id is required/],
    ['an invalid table id', ['Not_Valid'], /not a valid table id/],
    ['two table ids', ['table-001', 'table-002'], /Unexpected argument/],
    ['an unknown option', ['table-001', '--colour'], /Unknown option --colour/],
    ['--out with no value', ['table-001', '--out'], /--out needs a directory/],
    [
      '--out followed by an option',
      ['table-001', '--out', '--no-verify'],
      /--out needs a directory/,
    ],
  ])('rejects %s', (_label, argv, message) => {
    expect(() => parseTableQrArguments(argv)).toThrow(message);
  });
});

describe('runTableQr', () => {
  it('writes an SVG and a PNG named after the table, and prints the link and the paths', async () => {
    const { dependencies, out, err } = setup();

    const code = await runTableQr(['table-001', '--out', directory], dependencies);

    expect(code).toBe(0);
    expect(err).toStrictEqual([]);
    expect((await readdir(directory)).sort()).toStrictEqual(['table-001.png', 'table-001.svg']);
    expect(out[0]).toBe('Link: https://app.athar.example/t/table-001');
    expect(out[1]).toContain(join(directory, 'table-001.svg'));
    expect(out[2]).toContain(join(directory, 'table-001.png'));
  });

  it('writes a real SVG and a real PNG of at least 1024 pixels', async () => {
    const { dependencies } = setup();

    await runTableQr(['table-001', '--out', directory], dependencies);

    const svg = await readFile(join(directory, 'table-001.svg'), 'utf8');
    const png = await readFile(join(directory, 'table-001.png'));
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);

    expect(svg.startsWith('<svg') || svg.startsWith('<?xml')).toBe(true);
    expect(svg).toContain('</svg>');
    expect(png.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true);
    expect(width).toBe(height);
    expect(width).toBeGreaterThanOrEqual(QR_MIN_PNG_PIXELS);
  });

  it('encodes a different picture for a different table', async () => {
    const { dependencies } = setup();

    await runTableQr(['table-001', '--out', directory, '--no-verify'], dependencies);
    await runTableQr(['table-002', '--out', directory, '--no-verify'], dependencies);

    expect(await readFile(join(directory, 'table-001.svg'), 'utf8')).not.toBe(
      await readFile(join(directory, 'table-002.svg'), 'utf8'),
    );
  });

  it('is deterministic: the same link gives the same files', async () => {
    const first = await writeQrFiles('https://app.athar.example/t/table-001', 'a', directory);
    const second = await writeQrFiles('https://app.athar.example/t/table-001', 'b', directory);

    expect(await readFile(first.svgPath, 'utf8')).toBe(await readFile(second.svgPath, 'utf8'));
    expect((await readFile(first.pngPath)).equals(await readFile(second.pngPath))).toBe(true);
  });

  it('creates the output directory, including missing parents', async () => {
    const { dependencies } = setup();
    const nested = join(directory, 'a', 'b');

    expect(await runTableQr(['table-001', '--out', nested], dependencies)).toBe(0);
    expect((await stat(join(nested, 'table-001.svg'))).isFile()).toBe(true);
  });

  describe('verification', () => {
    it('refuses an unknown table, with exit code 1, and writes nothing', async () => {
      const { dependencies, err } = setup();

      const code = await runTableQr(['no-such-table', '--out', directory], dependencies);

      expect(code).toBe(1);
      expect(err.join('\n')).toContain('No table with id no-such-table');
      expect(err.join('\n')).toContain('--no-verify');
      expect(await readdir(directory)).toStrictEqual([]);
    });

    it('generates the code for an unknown table when told not to verify', async () => {
      const { dependencies } = setup();

      expect(
        await runTableQr(['no-such-table', '--out', directory, '--no-verify'], dependencies),
      ).toBe(0);
      expect(await readdir(directory)).toHaveLength(2);
    });

    it('does not even open the tables file when told not to verify', async () => {
      const { dependencies } = setup();
      let opened = false;

      await runTableQr(['table-001', '--out', directory, '--no-verify'], {
        ...dependencies,
        openRepository: () => {
          opened = true;
          return Promise.resolve(new InMemoryTableRepository());
        },
      });

      expect(opened).toBe(false);
    });

    it('still generates the code for a disabled table, with a note', async () => {
      const { dependencies, err } = setup();

      expect(await runTableQr(['table-off', '--out', directory], dependencies)).toBe(0);
      expect(err.join('\n')).toContain('table-off is currently disabled');
    });

    it('reports an unreadable tables file as a failure, not a crash', async () => {
      const { dependencies, err } = setup();
      const { StartupConfigurationError } =
        await import('../config/startup-configuration.error.js');

      const code = await runTableQr(['table-001', '--out', directory], {
        ...dependencies,
        openRepository: () => Promise.reject(new StartupConfigurationError('file is corrupt')),
      });

      expect(code).toBe(1);
      expect(err).toStrictEqual(['file is corrupt']);
    });
  });

  describe('the link', () => {
    it('uses PUBLIC_LINK_BASE_URL', async () => {
      const { dependencies, out } = setup('https://tables.example.org');

      await runTableQr(['table-001', '--out', directory], dependencies);

      expect(out[0]).toBe('Link: https://tables.example.org/t/table-001');
    });

    it('falls back to athar:// in development, and says why that matters', async () => {
      const { dependencies, out, err } = setup(null);

      await runTableQr(['table-001', '--out', directory], dependencies);

      expect(out[0]).toBe('Link: athar://t/table-001');
      expect(err.join('\n')).toContain('PUBLIC_LINK_BASE_URL is not set');
    });

    it('does not warn when the origin is configured', async () => {
      const { dependencies, err } = setup();

      await runTableQr(['table-001', '--out', directory], dependencies);

      expect(err).toStrictEqual([]);
    });
  });

  describe('bad usage', () => {
    it.each([
      ['no arguments', [], 2],
      ['an invalid id', ['Bad_Id'], 2],
      ['an unknown option', ['table-001', '--bogus'], 2],
    ])('exits 2 and prints the usage for %s', async (_label, argv, expected) => {
      const { dependencies, err } = setup();

      expect(await runTableQr(argv, dependencies)).toBe(expected);
      expect(err.at(-1)).toBe(TABLE_QR_USAGE);
    });

    it('prints the usage and exits 0 for --help, without touching anything', async () => {
      const { dependencies, out, err } = setup();

      expect(await runTableQr(['--help'], dependencies)).toBe(0);
      expect(out).toStrictEqual([TABLE_QR_USAGE]);
      expect(err).toStrictEqual([]);
    });
  });
});
