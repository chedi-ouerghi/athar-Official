import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Logger } from '@nestjs/common';
import { runDesignSvg, parseDesignSvgArguments, DESIGN_SVG_USAGE } from '../cli/design-svg.js';
import type { CliIo } from '../cli/cli-io.js';
import { TRAJECTORY_FORMAT } from '../device/trajectory.js';
import { designCollectionV1 } from './data/designs.v1.js';
import {
  escapeXml,
  renderContactSheet,
  renderDesignSvg,
  trajectoryPathData,
} from './design-svg.js';

const square = {
  format: TRAJECTORY_FORMAT,
  points: [
    [0, 0],
    [0, 0.5],
    [Math.PI / 2, 0.5],
    [Math.PI / 2, 0],
  ],
} as const;

describe('escapeXml', () => {
  it('escapes the characters that would break a document or an attribute', () => {
    expect(escapeXml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      `&lt;a href=&quot;x&quot;&gt;Tom &amp; 'Jerry'&lt;/a&gt;`,
    );
  });
});

describe('trajectoryPathData', () => {
  it('starts with M, continues with L, and has no non-finite number', () => {
    const data = trajectoryPathData({ ...square, points: [...square.points] });

    expect(data.startsWith('M0.0000 0.0000')).toBe(true);
    expect(data).toMatch(/^M[-\d. ]+(L[-\d. ]+)+$/);
    expect(data).not.toMatch(/NaN|Infinity/);
  });

  it('flips the y axis so that angles run counter-clockwise on the page, as on the table', () => {
    // A point at +90 degrees is "up" on the table: SVG's y grows downward, so it is negative.
    const data = trajectoryPathData({
      format: TRAJECTORY_FORMAT,
      points: [
        [0, 0],
        [Math.PI / 2, 0.5],
      ],
    });
    const last = data.split('L').at(-1)!.split(' ');

    expect(Number(last[0])).toBeCloseTo(0, 3);
    expect(Number(last[1])).toBeCloseTo(-0.5, 3);
  });

  it('follows the curve the table draws, not the chord: a half turn at constant radius is round', () => {
    const data = trajectoryPathData({
      format: TRAJECTORY_FORMAT,
      points: [
        [0, 0.5],
        [Math.PI, 0.5],
      ],
    });
    const points = data
      .slice(1)
      .split('L')
      .map((pair) => pair.split(' ').map(Number) as [number, number]);

    // Every sampled point is on the circle of radius 0.5, though the ends are a diameter apart.
    for (const [x, y] of points) {
      expect(Math.hypot(x, y)).toBeCloseTo(0.5, 3);
    }
    expect(points.length).toBeGreaterThan(100);
  });
});

describe('renderDesignSvg', () => {
  const svg = renderDesignSvg({ ...square, points: [...square.points] }, 'Four & <twenty>');

  it('is a well-formed SVG document with an escaped title', () => {
    expect(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('<title>Four &amp; &lt;twenty&gt;</title>');
    expect(svg.trimEnd().endsWith('</svg>')).toBe(true);
  });

  it('draws the table rim, one path and a mark at the centre', () => {
    expect(svg.match(/<circle /g)).toHaveLength(2);
    expect(svg.match(/<path /g)).toHaveLength(1);
    expect(svg).toContain('r="1"');
  });

  it('centres the view on the table with a margin around the rim', () => {
    expect(svg).toContain('viewBox="-1.06 -1.06 2.12 2.12"');
  });

  it('is deterministic', () => {
    expect(renderDesignSvg({ ...square, points: [...square.points] }, 'Four & <twenty>')).toBe(svg);
  });
});

describe('renderContactSheet', () => {
  const entries = designCollectionV1.designs.map((design) => ({
    title: design.title.en,
    trajectory: design.trajectory,
  }));
  const sheet = renderContactSheet(entries);

  it('has one picture and one label per design, laid out two across', () => {
    expect(sheet.match(/<path /g)).toHaveLength(4);
    expect(sheet.match(/<text /g)).toHaveLength(4);
    for (const { title } of entries) {
      expect(sheet).toContain(`>${title}</text>`);
    }
    expect(sheet).toContain('translate(0 0)');
    expect(sheet).toContain('translate(600 0)');
    expect(sheet).toContain('translate(0 644)');
    expect(sheet).toContain('translate(600 644)');
  });

  it('is a complete document', () => {
    expect(sheet.startsWith('<?xml')).toBe(true);
    expect(sheet.trimEnd().endsWith('</svg>')).toBe(true);
  });
});

describe('the designs:svg command', () => {
  let directory: string;

  const capture = (): { io: CliIo; out: string[]; err: string[] } => {
    const out: string[] = [];
    const err: string[] = [];
    return { io: { out: (text) => out.push(text), err: (text) => err.push(text) }, out, err };
  };

  beforeEach(async () => {
    Logger.overrideLogger(false);
    directory = await mkdtemp(join(tmpdir(), 'athar-design-svg-'));
  });

  afterEach(async () => {
    Logger.overrideLogger(['log', 'error', 'warn']);
    await rm(directory, { recursive: true, force: true });
  });

  it('writes one SVG per design, named by slug, and a contact sheet', async () => {
    const { io, out } = capture();

    expect(await runDesignSvg(['--out', directory], io)).toBe(0);
    expect((await readdir(directory)).sort()).toStrictEqual([
      'al-sadu-diamonds.svg',
      'contact-sheet.svg',
      'desert-dunes.svg',
      'eight-point-star.svg',
      'palm-fronds.svg',
    ]);
    expect(out).toHaveLength(5);
  });

  it('writes real pictures: each file holds its design title and a long path', async () => {
    await runDesignSvg(['--out', directory], capture().io);

    for (const design of designCollectionV1.designs) {
      const svg = await readFile(join(directory, `${design.slug}.svg`), 'utf8');

      expect(svg).toContain(`<title>${design.title.en}</title>`);
      expect(svg.length).toBeGreaterThan(20_000);
    }
  });

  it('creates the output directory, including missing parents', async () => {
    expect(await runDesignSvg(['--out', join(directory, 'a', 'b')], capture().io)).toBe(0);
    expect(await readdir(join(directory, 'a', 'b'))).toHaveLength(5);
  });

  it('prints the usage for --help, and writes nothing', async () => {
    const { io, out } = capture();

    expect(await runDesignSvg(['--help'], io)).toBe(0);
    expect(out).toStrictEqual([DESIGN_SVG_USAGE]);
    expect(await readdir(directory)).toStrictEqual([]);
  });

  it.each([
    ['an unknown option', ['--colour']],
    ['--out with no value', ['--out']],
    ['a stray argument', ['oops']],
  ])('exits 2 with the usage for %s', async (_label, argv) => {
    const { io, err } = capture();

    expect(await runDesignSvg(argv, io)).toBe(2);
    expect(err.at(-1)).toBe(DESIGN_SVG_USAGE);
  });

  it('parses --out', () => {
    expect(parseDesignSvgArguments(['--out', 'somewhere'])).toStrictEqual({
      outputDirectory: 'somewhere',
    });
    expect(parseDesignSvgArguments([])).toStrictEqual({ outputDirectory: './design-previews' });
  });
});
