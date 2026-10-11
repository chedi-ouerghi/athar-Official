import { PREVIEW_PATH_MAX_POINTS, previewPathSchema } from '@athar/contracts';
import { describe, expect, it } from 'vitest';
import {
  TRAJECTORY_FORMAT,
  trajectoryLength,
  type PolarPoint,
  type Trajectory,
} from '../device/trajectory.js';
import { designCollectionV1 } from './data/designs.v1.js';
import {
  distanceToPolyline,
  distanceToSegment,
  polarToXY,
  polylineLength,
  sampleCurve,
  simplifyIndices,
  type XY,
} from './geometry.js';
import { TWO_PI } from './generators/path-builder.js';
import { generateStar } from './generators/star.js';
import { derivePreviewPath } from './preview-path.js';

const trajectory = (...points: PolarPoint[]): Trajectory => ({ format: TRAJECTORY_FORMAT, points });

/** A circle of radius 0.5 drawn with many points. */
const circle = trajectory(
  ...Array.from({ length: 2001 }, (_, i): PolarPoint => [(TWO_PI * i) / 2000, 0.5]),
);

/** Distance from `point` to the polyline `line`, edge by edge. */
function distanceToLine(point: XY, line: readonly XY[]): number {
  let nearest = Infinity;

  for (let index = 1; index < line.length; index += 1) {
    nearest = Math.min(nearest, distanceToSegment(point, line[index - 1]!, line[index]!));
  }

  return nearest;
}

describe('simplifyIndices', () => {
  it('keeps only the ends of a straight line', () => {
    const line: XY[] = Array.from({ length: 50 }, (_, i): XY => [i * 0.1, i * 0.05]);

    expect(simplifyIndices(line, 1e-9)).toStrictEqual([0, 49]);
  });

  it('keeps a corner', () => {
    const corner: XY[] = [
      ...Array.from({ length: 20 }, (_, i): XY => [i * 0.1, 0]),
      ...Array.from({ length: 20 }, (_, i): XY => [1.9, (i + 1) * 0.1]),
    ];
    const kept = simplifyIndices(corner, 0.01);

    expect(kept).toContain(19);
    expect(kept).toHaveLength(3);
  });

  it('keeps every vertex when the tolerance is zero and the path bends', () => {
    const zigzag: XY[] = Array.from({ length: 10 }, (_, i): XY => [i, i % 2]);

    expect(simplifyIndices(zigzag, 0)).toHaveLength(10);
  });

  it('keeps fewer vertices as the tolerance grows, never more', () => {
    const wave: XY[] = Array.from({ length: 400 }, (_, i): XY => [
      i * 0.01,
      Math.sin(i * 0.1) * 0.2,
    ]);
    const counts = [0.0001, 0.001, 0.01, 0.05, 0.2].map(
      (tolerance) => simplifyIndices(wave, tolerance).length,
    );

    for (let index = 1; index < counts.length; index += 1) {
      expect(counts[index]).toBeLessThanOrEqual(counts[index - 1]!);
    }
  });

  it('never leaves a dropped vertex further from the result than the tolerance', () => {
    const wave: XY[] = Array.from({ length: 400 }, (_, i): XY => [
      i * 0.01,
      Math.sin(i * 0.1) * 0.2,
    ]);
    const tolerance = 0.02;
    const kept = simplifyIndices(wave, tolerance);
    const line = kept.map((index) => wave[index]!);

    for (const vertex of wave) {
      expect(distanceToLine(vertex, line)).toBeLessThanOrEqual(tolerance + 1e-12);
    }
  });

  it('copes with trivial input', () => {
    expect(simplifyIndices([], 0.1)).toStrictEqual([]);
    expect(simplifyIndices([[0, 0]], 0.1)).toStrictEqual([0]);
    expect(
      simplifyIndices(
        [
          [0, 0],
          [1, 1],
        ],
        0.1,
      ),
    ).toStrictEqual([0, 1]);
  });
});

describe('derivePreviewPath', () => {
  it('reduces a long trajectory to no more than the maximum, and uses most of the budget', () => {
    const preview = derivePreviewPath(circle);

    expect(preview.length).toBeLessThanOrEqual(PREVIEW_PATH_MAX_POINTS);
    expect(preview.length).toBeGreaterThan(PREVIEW_PATH_MAX_POINTS * 0.5);
  });

  it('returns a short trajectory unchanged', () => {
    const short = trajectory([0, 0], [1, 0.5], [2, 1]);

    expect(derivePreviewPath(short)).toStrictEqual([
      [0, 0],
      [1, 0.5],
      [2, 1],
    ]);
  });

  it('honours a smaller maximum', () => {
    expect(derivePreviewPath(circle, 100).length).toBeLessThanOrEqual(100);
    expect(derivePreviewPath(circle, 100).length).toBeGreaterThan(50);
  });

  it('only ever uses points of the trajectory itself, in order', () => {
    const preview = derivePreviewPath(circle);
    let position = 0;

    for (const point of preview) {
      const found = circle.points.findIndex(
        (candidate, index) =>
          index >= position && candidate[0] === point[0] && candidate[1] === point[1],
      );

      expect(found).toBeGreaterThanOrEqual(position);
      position = found;
    }
  });

  it('keeps rho inside 0..1 and is accepted by the shared schema', () => {
    const preview = derivePreviewPath(circle);

    expect(previewPathSchema.safeParse(preview).success).toBe(true);
    expect(preview.every(([, rho]) => rho >= 0 && rho <= 1)).toBe(true);
  });

  it('does not touch the trajectory it was given', () => {
    const before = JSON.stringify(circle);

    derivePreviewPath(circle);

    expect(JSON.stringify(circle)).toBe(before);
  });

  it('is deterministic', () => {
    expect(derivePreviewPath(circle)).toStrictEqual(derivePreviewPath(circle));
  });
});

describe.each(designCollectionV1.designs.map((design) => [design.id, design.trajectory] as const))(
  'the preview of the %s design',
  (_id, design) => {
    const preview = derivePreviewPath(design);
    const previewLine = preview.map(polarToXY);
    const original = design.points.map(polarToXY);

    it('has at most the maximum number of points, and at least two', () => {
      expect(preview.length).toBeLessThanOrEqual(PREVIEW_PATH_MAX_POINTS);
      expect(preview.length).toBeGreaterThanOrEqual(2);
    });

    it('starts and ends exactly where the design does, in the same unwrapped convention', () => {
      expect(preview[0]).toStrictEqual(design.points[0]);
      expect(preview.at(-1)).toStrictEqual(design.points.at(-1));
    });

    it('stays close to the design: no point of the design is far from the preview', () => {
      const worst = Math.max(...original.map((point) => distanceToLine(point, previewLine)));

      // Within one percent of the table radius, a few pixels on a phone screen. The dunes
      // use the whole 500-point budget; the star and the fronds are exact.
      expect(worst).toBeLessThan(0.01);
    });

    it('is as long as the design to within a few percent, so progress can be read off it', () => {
      const actual = trajectoryLength(design);
      const drawn = polylineLength(previewLine);

      expect(drawn).toBeLessThanOrEqual(actual * 1.001);
      expect(drawn).toBeGreaterThan(actual * 0.97);
    });

    it('does not draw anything the design does not: the preview never strays from the curve', () => {
      const curve = sampleCurve(design.points, 0.01);
      let worst = 0;

      for (const [index, point] of previewLine.entries()) {
        const next = previewLine[index + 1];

        if (next !== undefined) {
          const middle: XY = [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2];
          worst = Math.max(worst, distanceToPolyline(middle, curve));
        }
      }

      expect(worst).toBeLessThan(0.02);
    });
  },
);

describe('what simplification preserves that even spacing would not', () => {
  it('keeps every corner of the star', () => {
    // 4 stars of 16 vertices each.
    const preview = derivePreviewPath(generateStar()).map(polarToXY);
    const radii = [0.92 * 0.7 ** 3, 0.92 * 0.7 ** 2, 0.92 * 0.7, 0.92];
    const turns = [Math.PI / 8, 0, Math.PI / 8, 0];
    let missing = 0;

    for (const [index, radius] of radii.entries()) {
      for (let vertex = 0; vertex < 16; vertex += 1) {
        const angle = turns[index]! + (Math.PI / 8) * vertex;
        const r = radius * (vertex % 2 === 0 ? 1 : 0.7);
        const corner: XY = [r * Math.cos(angle), r * Math.sin(angle)];

        if (
          Math.min(
            ...preview.map((point) => Math.hypot(point[0] - corner[0], point[1] - corner[1])),
          ) > 0.004
        ) {
          missing += 1;
        }
      }
    }

    expect(missing).toBe(0);
  });

  it('does not shorten the palm fronds by a fifth, as even spacing did', () => {
    const khoos = designCollectionV1.designs.find((design) => design.id === 'khoos')!;
    const drawn = polylineLength(derivePreviewPath(khoos.trajectory).map(polarToXY));

    expect(drawn / trajectoryLength(khoos.trajectory)).toBeGreaterThan(0.97);
  });
});
