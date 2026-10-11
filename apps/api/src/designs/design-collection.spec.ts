import { PREVIEW_PATH_MAX_POINTS } from '@athar/contracts';
import { describe, expect, it } from 'vitest';
import { TRAJECTORY_FORMAT, trajectoryLength, type Trajectory } from '../device/trajectory.js';
import {
  DesignCollectionError,
  EXPECTED_DESIGN_COUNT,
  MAX_POINT_SPACING,
  MODERN_INTERPRETATION_PHRASE,
  loadDesignCollection,
  type DesignCollectionDefinition,
  type DesignDefinition,
} from './design-collection.js';
import {
  NOMINAL_SPEED_RADII_PER_SECOND,
  designCollectionV1,
  estimateDurationSeconds,
} from './data/designs.v1.js';
import { HOME_RHO } from './home.js';

/**
 * Every URL cited in the collection, each of which was opened and read in
 * writing docs/designs.md. A new source must be added here only after it has
 * been opened, which is the point of this list: a source can never slip into the
 * data unread.
 */
const OPENED_SOURCES = new Set([
  'https://abudhabiculture.ae/en/Heritage-Carousel/Al-Sadu',
  'https://ich.unesco.org/en/RL/al-sadu-traditional-weaving-skills-in-the-united-arab-emirates-02223?RL=02223',
  'https://qasralhosn.ae/house-of-artisans/',
  'https://ich.unesco.org/en/decisions/17.COM/7.B.33',
]);

const [first, second, third, fourth] = designCollectionV1.designs as [
  DesignDefinition,
  DesignDefinition,
  DesignDefinition,
  DesignDefinition,
];

/** The real collection with one design changed. */
function withDesign(
  index: number,
  change: (design: DesignDefinition) => DesignDefinition,
  collectionVersion = 1,
): DesignCollectionDefinition {
  return {
    collectionVersion,
    designs: designCollectionV1.designs.map((design, position) =>
      position === index ? change(design) : design,
    ),
  };
}

/** The problems loading a collection reports, or `[]` if it loads. */
function problemsOf(definition: DesignCollectionDefinition): readonly string[] {
  try {
    loadDesignCollection(definition);
    return [];
  } catch (error) {
    if (error instanceof DesignCollectionError) {
      return error.problems;
    }

    throw error;
  }
}

const mentions = (problems: readonly string[], text: string | RegExp): boolean =>
  problems.some((problem) =>
    typeof text === 'string' ? problem.includes(text) : text.test(problem),
  );

const line: Trajectory['points'] = [
  [0, 0],
  [0, 0.5],
  [0, 0],
];

describe('the shipped collection', () => {
  const collection = loadDesignCollection(designCollectionV1);

  it('loads without a single problem', () => {
    expect(problemsOf(designCollectionV1)).toStrictEqual([]);
  });

  it('has collection version 1 and exactly four designs', () => {
    expect(collection.collectionVersion).toBe(1);
    expect(collection.designs).toHaveLength(EXPECTED_DESIGN_COUNT);
    expect(EXPECTED_DESIGN_COUNT).toBe(4);
  });

  it('gives every design its own id and slug', () => {
    expect(new Set(collection.designs.map((design) => design.id)).size).toBe(4);
    expect(new Set(collection.designs.map((design) => design.slug)).size).toBe(4);
  });

  it('has the four themes, in a stable order', () => {
    expect(collection.designs.map((design) => design.slug)).toStrictEqual([
      'desert-dunes',
      'al-sadu-diamonds',
      'eight-point-star',
      'palm-fronds',
    ]);
  });

  it('has English and Arabic for every piece of text', () => {
    for (const design of collection.designs) {
      for (const text of [design.title, design.description, design.inspiration.note]) {
        expect(text.en).toMatch(/[A-Za-z]/);
        expect(text.ar).toMatch(/[؀-ۿ]/);
      }
    }
  });

  it('keeps titles short enough for a card and descriptions to a sentence or two', () => {
    for (const design of collection.designs) {
      expect(design.title.en.length).toBeLessThanOrEqual(30);
      expect(design.title.ar.length).toBeLessThanOrEqual(30);
      expect(design.description.en.length).toBeLessThanOrEqual(200);
      expect(design.description.ar.length).toBeLessThanOrEqual(200);
    }
  });

  it('labels only the Al Sadu design as documented traditional, and gives it checkable sources', () => {
    const kinds = Object.fromEntries(
      collection.designs.map((design) => [design.id, design.inspiration.kind]),
    );

    expect(kinds).toStrictEqual({
      dunes: 'original-modern',
      sadu: 'documented-traditional',
      star: 'original-modern',
      khoos: 'original-modern',
    });
    expect(second.inspiration.sources.every((source) => source.url !== undefined)).toBe(true);
  });

  it('says in the English note of every modern design that it is a modern interpretation', () => {
    for (const design of collection.designs) {
      if (design.inspiration.kind === 'original-modern') {
        expect(design.inspiration.note.en.toLowerCase()).toContain(MODERN_INTERPRETATION_PHRASE);
      }
    }
  });

  it('cites only sources that were actually opened, all over https', () => {
    const urls = collection.designs.flatMap((design) =>
      design.inspiration.sources.map((source) => source.url),
    );

    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url).toMatch(/^https:\/\//);
      expect(OPENED_SOURCES.has(url ?? '')).toBe(true);
    }
  });

  it('cites no source for the star, which no opened page supports', () => {
    expect(third.inspiration.sources).toStrictEqual([]);
  });

  it('starts and ends every design at the home radius', () => {
    for (const design of collection.designs) {
      expect(design.trajectory.points[0]?.[1]).toBe(HOME_RHO);
      expect(Math.abs((design.trajectory.points.at(-1)?.[1] ?? 1) - HOME_RHO)).toBeLessThan(1e-6);
    }
  });

  it('derives a preview of at most the maximum size for every design', () => {
    for (const design of collection.designs) {
      expect(design.previewPath.length).toBeLessThanOrEqual(PREVIEW_PATH_MAX_POINTS);
      expect(design.previewPath.length).toBeGreaterThan(50);
    }
  });

  it('estimates durations from length at one nominal speed, rounded to 30 seconds', () => {
    for (const design of collection.designs) {
      expect(design.estimatedDurationSeconds % 30).toBe(0);
      expect(design.estimatedDurationSeconds).toBe(estimateDurationSeconds(design.trajectory));

      const speed = trajectoryLength(design.trajectory) / design.estimatedDurationSeconds;
      expect(speed).toBeGreaterThan(NOMINAL_SPEED_RADII_PER_SECOND * 0.9);
      expect(speed).toBeLessThan(NOMINAL_SPEED_RADII_PER_SECOND * 1.1);
    }
  });

  it('takes between a few minutes and a quarter of an hour per design', () => {
    for (const design of collection.designs) {
      expect(design.estimatedDurationSeconds).toBeGreaterThanOrEqual(180);
      expect(design.estimatedDurationSeconds).toBeLessThanOrEqual(900);
    }
  });

  it('keeps the full trajectory in the record, for the drawing engine', () => {
    for (const design of collection.designs) {
      expect(design.trajectory.format).toBe(TRAJECTORY_FORMAT);
      expect(design.trajectory.points.length).toBeGreaterThan(PREVIEW_PATH_MAX_POINTS);
    }
  });
});

describe('collection rules', () => {
  it.each([0, -1, 1.5])('rejects a collectionVersion of %s', (version) => {
    expect(
      mentions(
        problemsOf({ ...designCollectionV1, collectionVersion: version }),
        'collectionVersion',
      ),
    ).toBe(true);
  });

  it('rejects three designs, and five', () => {
    const three = { ...designCollectionV1, designs: designCollectionV1.designs.slice(0, 3) };
    const five = { ...designCollectionV1, designs: [...designCollectionV1.designs, first] };

    expect(mentions(problemsOf(three), 'exactly 4 designs, not 3')).toBe(true);
    expect(mentions(problemsOf(five), 'exactly 4 designs, not 5')).toBe(true);
  });

  it('rejects an empty collection', () => {
    expect(mentions(problemsOf({ collectionVersion: 1, designs: [] }), 'not 0')).toBe(true);
  });

  it('rejects a repeated id', () => {
    expect(
      mentions(
        problemsOf(withDesign(1, (d) => ({ ...d, id: first.id }))),
        'id "dunes" is used more than once',
      ),
    ).toBe(true);
  });

  it('rejects a repeated slug', () => {
    expect(
      mentions(
        problemsOf(withDesign(1, (d) => ({ ...d, slug: first.slug }))),
        'slug "desert-dunes" is used more than once',
      ),
    ).toBe(true);
  });

  it.each([
    ['uppercase', 'Dunes'],
    ['a space', 'desert dunes'],
    ['an underscore', 'desert_dunes'],
    ['an empty string', ''],
    ['leading hyphen', '-dunes'],
  ])('rejects an id with %s', (_label, id) => {
    expect(mentions(problemsOf(withDesign(0, (d) => ({ ...d, id }))), /design "[^"]*": id/)).toBe(
      true,
    );
  });

  it.each([0, -30, 1.5, Number.NaN])('rejects a duration of %s', (seconds) => {
    expect(
      mentions(
        problemsOf(withDesign(0, (d) => ({ ...d, estimatedDurationSeconds: seconds }))),
        'estimatedDurationSeconds',
      ),
    ).toBe(true);
  });

  it('reports every problem at once, not just the first', () => {
    const broken = withDesign(0, (d) => ({
      ...d,
      id: 'Bad Id',
      title: { en: 'العربية فقط', ar: 'English only' },
    }));
    const problems = problemsOf(broken);

    expect(problems.length).toBeGreaterThanOrEqual(3);
  });

  it('describes every problem in a message an operator can read', () => {
    const error = (() => {
      try {
        loadDesignCollection({ collectionVersion: 1, designs: [] });
      } catch (caught) {
        return caught as DesignCollectionError;
      }
      throw new Error('should have thrown');
    })();

    expect(error.message).toContain('The design collection is invalid:');
    expect(error.message).toContain('  - the collection must contain exactly 4 designs');
  });
});

describe('inspiration rules', () => {
  it('rejects a documented traditional design with no source at all', () => {
    const problems = problemsOf(
      withDesign(1, (d) => ({ ...d, inspiration: { ...d.inspiration, sources: [] } })),
    );

    expect(mentions(problems, 'a documented traditional design needs')).toBe(true);
  });

  it('rejects a documented traditional design whose sources have no URL to check', () => {
    const problems = problemsOf(
      withDesign(1, (d) => ({
        ...d,
        inspiration: { ...d.inspiration, sources: [{ label: 'A book I remember' }] },
      })),
    );

    expect(mentions(problems, 'URL that can be checked')).toBe(true);
  });

  it('rejects a source that is not served over https', () => {
    const problems = problemsOf(
      withDesign(1, (d) => ({
        ...d,
        inspiration: {
          ...d.inspiration,
          sources: [{ label: 'Plain http', url: 'http://example.org/x' }],
        },
      })),
    );

    expect(mentions(problems, 'must use an https URL')).toBe(true);
  });

  it('accepts an original modern design with no sources at all', () => {
    expect(
      problemsOf(withDesign(2, (d) => ({ ...d, inspiration: { ...d.inspiration, sources: [] } }))),
    ).toStrictEqual([]);
  });

  it('rejects an original modern design whose note does not say it is a modern interpretation', () => {
    const problems = problemsOf(
      withDesign(0, (d) => ({
        ...d,
        inspiration: {
          ...d.inspiration,
          note: { ...d.inspiration.note, en: 'An ancient pattern handed down for generations.' },
        },
      })),
    );

    expect(mentions(problems, MODERN_INTERPRETATION_PHRASE)).toBe(true);
  });

  it('does not require a documented traditional note to say that', () => {
    expect(
      problemsOf(
        withDesign(1, (d) => ({
          ...d,
          inspiration: {
            ...d.inspiration,
            note: { ...d.inspiration.note, en: 'Based on a documented craft.' },
          },
        })),
      ),
    ).toStrictEqual([]);
  });

  it('rejects an unknown kind', () => {
    const problems = problemsOf(
      withDesign(0, (d) => ({
        ...d,
        inspiration: { ...d.inspiration, kind: 'folk' as 'original-modern' },
      })),
    );

    expect(problems.length).toBeGreaterThan(0);
  });
});

describe('localized text rules', () => {
  it.each(['title', 'description'] as const)('rejects a blank English %s', (field) => {
    expect(
      mentions(
        problemsOf(withDesign(0, (d) => ({ ...d, [field]: { ...d[field], en: '' } }))),
        field,
      ),
    ).toBe(true);
  });

  it.each(['title', 'description'] as const)('rejects a blank Arabic %s', (field) => {
    expect(
      mentions(
        problemsOf(withDesign(0, (d) => ({ ...d, [field]: { ...d[field], ar: '' } }))),
        field,
      ),
    ).toBe(true);
  });

  it('rejects an inspiration note that is missing a language', () => {
    expect(
      problemsOf(
        withDesign(0, (d) => ({
          ...d,
          inspiration: {
            ...d.inspiration,
            note: { en: d.inspiration.note.en } as DesignDefinition['title'],
          },
        })),
      ).length,
    ).toBeGreaterThan(0);
  });

  it('rejects Arabic text that contains no Arabic letters, such as English pasted into the wrong field', () => {
    const problems = problemsOf(
      withDesign(0, (d) => ({ ...d, title: { ...d.title, ar: 'Desert Dunes' } })),
    );

    expect(mentions(problems, 'title.ar has no Arabic letters')).toBe(true);
  });

  it('rejects English text that contains no Latin letters', () => {
    const problems = problemsOf(
      withDesign(0, (d) => ({ ...d, title: { ...d.title, en: 'كثبان' } })),
    );

    expect(mentions(problems, 'title.en has no Latin letters')).toBe(true);
  });
});

describe('trajectory rules', () => {
  const withTrajectory = (points: Trajectory['points'], index = 0) =>
    withDesign(index, (d) => ({ ...d, trajectory: { format: TRAJECTORY_FORMAT, points } }));

  it('accepts a minimal out-and-back line at the right radius and spacing', () => {
    // Too short for the length checks elsewhere, but valid on every rule here.
    const dense: Trajectory['points'] = [
      ...Array.from({ length: 51 }, (_, i): [number, number] => [0, i * 0.01]),
      ...Array.from({ length: 50 }, (_, i): [number, number] => [0, 0.49 - i * 0.01]),
    ];

    expect(problemsOf(withTrajectory(dense))).toStrictEqual([]);
  });

  it('rejects a design that does not start at home', () => {
    const problems = problemsOf(
      withTrajectory([
        [0, 0.3],
        ...Array.from({ length: 31 }, (_, i): [number, number] => [0, 0.3 - i * 0.01]),
      ]),
    );

    expect(mentions(problems, 'starts at rho 0.3')).toBe(true);
  });

  it('rejects a design that does not end at home', () => {
    const problems = problemsOf(
      withTrajectory(Array.from({ length: 31 }, (_, i): [number, number] => [0, i * 0.01])),
    );

    expect(mentions(problems, /ends at rho 0\.3/)).toBe(true);
  });

  it('rejects a rho outside the table', () => {
    const problems = problemsOf(
      withTrajectory([
        [0, 0],
        [0, 1.2],
        [0, 0],
      ]),
    );

    expect(mentions(problems, 'outside 0..1')).toBe(true);
  });

  it('rejects a jump: two points further apart than the limit', () => {
    const problems = problemsOf(withTrajectory([...line]));

    expect(mentions(problems, `the limit is ${MAX_POINT_SPACING}`)).toBe(true);
  });

  it('rejects a segment too curved to be sampled faithfully', () => {
    // Half a turn at a large radius in one step is a big arc, not a nearly straight stretch.
    const points: Trajectory['points'] = [
      [0, 0],
      ...Array.from({ length: 40 }, (_, i): [number, number] => [0, 0.02 * (i + 1)]),
      [Math.PI, 0.8],
      ...Array.from({ length: 40 }, (_, i): [number, number] => [Math.PI, 0.78 - 0.02 * i]),
    ];

    expect(mentions(problemsOf(withTrajectory(points)), 'curves too far')).toBe(true);
  });

  it('rejects a trajectory with fewer than two points, or in an unknown format', () => {
    expect(mentions(problemsOf(withTrajectory([[0, 0]])), 'at least two points')).toBe(true);
    expect(
      mentions(
        problemsOf(
          withDesign(0, (d) => ({
            ...d,
            trajectory: { format: 'cartesian/v1', points: [] } as unknown as Trajectory,
          })),
        ),
        'Unsupported trajectory format',
      ),
    ).toBe(true);
  });

  it('names the design a problem belongs to', () => {
    const problems = problemsOf(
      withTrajectory(
        [
          [0, 0.3],
          [0, 0.31],
        ],
        3,
      ),
    );

    expect(problems.every((problem) => problem.startsWith(`design "${fourth.id}":`))).toBe(true);
  });
});
