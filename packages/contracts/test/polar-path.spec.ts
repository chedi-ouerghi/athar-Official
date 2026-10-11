import { describe, expect, it } from 'vitest';
import {
  cumulativePathLengths,
  locateAlongPath,
  polarPathLength,
  polarSegmentLength,
  type PolarPoint,
} from '../src/polar-path.js';

const TWO_PI = 2 * Math.PI;

function points(...list: PolarPoint[]): PolarPoint[] {
  return list;
}

function pointAt(path: readonly PolarPoint[], progress: number): PolarPoint {
  return locateAlongPath(path, progress).point;
}

/**
 * Independent reference: integrate sqrt(r^2 + k^2) over the segment with
 * Simpson's rule, instead of using the closed form under test.
 */
function numericLength([theta1, rho1]: PolarPoint, [theta2, rho2]: PolarPoint): number {
  const slope = (rho2 - rho1) / (theta2 - theta1);
  const steps = 200_000;
  const h = (theta2 - theta1) / steps;
  const f = (phi: number) => Math.hypot(rho1 + slope * (phi - theta1), slope);

  let sum = f(theta1) + f(theta2);
  for (let i = 1; i < steps; i += 1) {
    sum += f(theta1 + i * h) * (i % 2 === 0 ? 2 : 4);
  }

  return Math.abs((h / 3) * sum);
}

describe('polarSegmentLength', () => {
  it('measures a radial line as the change in rho', () => {
    expect(polarSegmentLength([1, 0], [1, 1])).toBeCloseTo(1, 12);
    expect(polarSegmentLength([1, 0.8], [1, 0.3])).toBeCloseTo(0.5, 12);
  });

  it('measures a circular arc as rho times the angle', () => {
    expect(polarSegmentLength([0, 0.5], [TWO_PI, 0.5])).toBeCloseTo(Math.PI, 12);
    expect(polarSegmentLength([0, 1], [Math.PI / 2, 1])).toBeCloseTo(Math.PI / 2, 12);
  });

  it('measures a spiral segment like numerical integration does', () => {
    const cases: [PolarPoint, PolarPoint][] = [
      [
        [0, 0],
        [TWO_PI, 1],
      ],
      [
        [0, 1],
        [3 * Math.PI, 0.2],
      ],
      [
        [1, 0.4],
        [1.5, 0.9],
      ],
      [
        [0, 0.2],
        [20, 0.8],
      ],
    ];

    for (const [from, to] of cases) {
      expect(polarSegmentLength(from, to)).toBeCloseTo(numericLength(from, to), 6);
    }
  });

  it('agrees with numerical integration for a slope too small for the closed form', () => {
    const from: PolarPoint = [0, 0.5];
    const to: PolarPoint = [TWO_PI, 0.5003];

    expect(polarSegmentLength(from, to)).toBeCloseTo(numericLength(from, to), 6);
  });

  it('does not depend on the direction of travel', () => {
    const from: PolarPoint = [0.3, 0.1];
    const to: PolarPoint = [4.2, 0.9];

    expect(polarSegmentLength(from, to)).toBeCloseTo(polarSegmentLength(to, from), 12);
  });

  it('is zero for a repeated point', () => {
    expect(polarSegmentLength([2, 0.5], [2, 0.5])).toBe(0);
  });
});

describe('cumulativePathLengths and polarPathLength', () => {
  it('starts at zero, never decreases and ends at the total', () => {
    const t = points([0, 0], [0, 1], [2, 1], [3, 0.5]);
    const lengths = cumulativePathLengths(t);

    expect(lengths).toHaveLength(t.length);
    expect(lengths[0]).toBe(0);
    for (const [index, length] of lengths.entries()) {
      expect(length).toBeGreaterThanOrEqual(lengths[index - 1] ?? 0);
    }
    expect(lengths.at(-1)).toBe(polarPathLength(t));
  });

  it('does not depend on how many points describe the same curve', () => {
    const coarse = points([0, 0.1], [TWO_PI, 0.9]);
    const fine = points(
      ...Array.from({ length: 41 }, (_, i): PolarPoint => {
        const t = i / 40;
        return [TWO_PI * t, 0.1 + 0.8 * t];
      }),
    );

    expect(polarPathLength(fine)).toBeCloseTo(polarPathLength(coarse), 9);
  });
});

describe('locateAlongPath', () => {
  it('returns the ends at progress 0 and 1, and clamps outside them', () => {
    const t = points([0, 0.2], [3, 0.8]);

    expect(pointAt(t, 0)).toStrictEqual([0, 0.2]);
    expect(pointAt(t, 1)).toStrictEqual([3, 0.8]);
    expect(pointAt(t, -1)).toStrictEqual([0, 0.2]);
    expect(pointAt(t, 2)).toStrictEqual([3, 0.8]);
  });

  it('finds the middle of a circle', () => {
    const [theta, rho] = pointAt(points([0, 0.5], [TWO_PI, 0.5]), 0.5);

    expect(theta).toBeCloseTo(Math.PI, 9);
    expect(rho).toBeCloseTo(0.5, 9);
  });

  it('measures progress by path length, not by point index', () => {
    // A radial line of length 1, then an arc of length 3: four units in all.
    const t = points([0, 0], [0, 1], [3, 1]);

    expect(pointAt(t, 0.25)).toStrictEqual([0, 1]);

    const [theta, rho] = pointAt(t, 0.5);
    expect(theta).toBeCloseTo(1, 9);
    expect(rho).toBeCloseTo(1, 9);
  });

  it('puts a point inside a spiral segment at the right distance along it', () => {
    const start: PolarPoint = [0, 0];
    const t = points(start, [TWO_PI, 1]);
    const total = polarPathLength(t);

    for (const progress of [0.1, 0.37, 0.5, 0.9]) {
      const point = pointAt(t, progress);

      expect(polarSegmentLength(start, point)).toBeCloseTo(progress * total, 9);
    }
  });
});

describe('locateAlongPath: the drawn prefix', () => {
  it('counts the points already passed', () => {
    const path = points([0, 0], [0, 1], [3, 1]);

    expect(locateAlongPath(path, 0).passed).toBe(1);
    expect(locateAlongPath(path, 0.1).passed).toBe(1);
    expect(locateAlongPath(path, 0.5).passed).toBe(2);
    expect(locateAlongPath(path, 1).passed).toBe(3);
  });

  it('rejects an empty path', () => {
    expect(() => locateAlongPath([], 0.5)).toThrow(RangeError);
  });
});
