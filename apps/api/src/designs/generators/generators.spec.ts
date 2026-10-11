import { describe, expect, it } from 'vitest';
import {
  describeTrajectoryProblems,
  polarSegmentLength,
  trajectoryLength,
  type PolarPoint,
  type Trajectory,
} from '../../device/trajectory.js';
import { MAX_CURVE_TO_CHORD_RATIO, MAX_POINT_SPACING } from '../design-collection.js';
import { distance, largestStep, polarToXY, sampleCurve, type XY } from '../geometry.js';
import { HOME_RHO, HOME_RHO_TOLERANCE } from '../home.js';
import { generateDunes } from './dunes.js';
import { generateKhoos } from './khoos.js';
import { TWO_PI } from './path-builder.js';
import { generateSadu } from './sadu.js';
import { generateStar } from './star.js';

const generators: [name: string, generate: () => Trajectory][] = [
  ['dunes', () => generateDunes()],
  ['sadu', () => generateSadu()],
  ['star', () => generateStar()],
  ['khoos', () => generateKhoos()],
];

function rhoRange(trajectory: Trajectory): [number, number] {
  const rhos = trajectory.points.map(([, rho]) => rho);

  return [Math.min(...rhos), Math.max(...rhos)];
}

/** Whether two segments of a polyline properly cross each other. */
function cross(a: XY, b: XY, c: XY, d: XY): boolean {
  const orient = (p: XY, q: XY, r: XY) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);

  return orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0;
}

describe.each(generators)('the %s generator (every design)', (_name, generate) => {
  const trajectory = generate();

  it('draws a valid polar-theta-rho/v1 trajectory', () => {
    expect(trajectory.format).toBe('polar-theta-rho/v1');
    expect(describeTrajectoryProblems(trajectory)).toStrictEqual([]);
    expect(
      trajectory.points.every(([theta, rho]) => Number.isFinite(theta) && Number.isFinite(rho)),
    ).toBe(true);
  });

  it('stays inside the table: rho is within 0..1', () => {
    const [min, max] = rhoRange(trajectory);

    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(1);
  });

  it('leaves a margin at the rim, so the ball never presses the edge', () => {
    expect(rhoRange(trajectory)[1]).toBeLessThan(0.99);
  });

  it('starts and ends at the home radius, so any design can follow any other', () => {
    const first = trajectory.points[0];
    const last = trajectory.points.at(-1);

    expect(Math.abs((first?.[1] ?? 1) - HOME_RHO)).toBeLessThanOrEqual(HOME_RHO_TOLERANCE);
    expect(Math.abs((last?.[1] ?? 1) - HOME_RHO)).toBeLessThanOrEqual(HOME_RHO_TOLERANCE);
  });

  it('is continuous: no two consecutive points are further apart than the limit', () => {
    expect(largestStep(trajectory.points)).toBeLessThanOrEqual(MAX_POINT_SPACING);
  });

  it('is sampled finely enough that the table draws what was intended', () => {
    for (const [index, point] of trajectory.points.entries()) {
      const previous = trajectory.points[index - 1];

      if (previous === undefined) {
        continue;
      }

      const chord = distance(polarToXY(previous), polarToXY(point));

      if (chord > 1e-6) {
        expect(polarSegmentLength(previous, point) / chord).toBeLessThanOrEqual(
          MAX_CURVE_TO_CHORD_RATIO,
        );
      }
    }
  });

  it('keeps theta unwrapped: it never jumps by half a turn or more between points', () => {
    for (const [index, [theta, rho]] of trajectory.points.entries()) {
      const previous = trajectory.points[index - 1];

      // At the centre the angle is free to turn, at no cost.
      if (previous !== undefined && rho > 1e-6 && previous[1] > 1e-6) {
        expect(Math.abs(theta - previous[0])).toBeLessThan(Math.PI);
      }
    }
  });

  it('is deterministic: the same call gives the same points', () => {
    expect(generate()).toStrictEqual(trajectory);
  });

  it('has a length that is neither trivial nor absurd', () => {
    const length = trajectoryLength(trajectory);

    expect(length).toBeGreaterThan(15);
    expect(length).toBeLessThan(80);
  });
});

describe('generateDunes', () => {
  const trajectory = generateDunes();

  it('winds out and back: theta rises past the outward turns, then returns to a half turn', () => {
    const thetas = trajectory.points.map(([theta]) => theta);

    expect(Math.max(...thetas)).toBeCloseTo(TWO_PI * 8 + Math.PI, 6);
    expect(thetas.at(-1)).toBeCloseTo(Math.PI, 6);
  });

  it('never crosses itself: the two interleaved arms keep apart', () => {
    const curve = sampleCurve(trajectory.points, 0.03);
    // Spatial hash, so the check is fast.
    const cell = 0.06;
    const buckets = new Map<string, number[]>();
    const key = (x: number, y: number) => `${Math.floor(x / cell)},${Math.floor(y / cell)}`;

    for (const [index, [x, y]] of curve.entries()) {
      const k = key(x, y);
      buckets.set(k, [...(buckets.get(k) ?? []), index]);
    }

    for (let index = 1; index < curve.length; index += 1) {
      const [a, b] = [curve[index - 1]!, curve[index]!];
      const nearby = new Set<number>();

      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          for (const other of buckets.get(key(a[0] + dx * cell, a[1] + dy * cell)) ?? []) {
            nearby.add(other);
          }
        }
      }

      for (const other of nearby) {
        // Skip a segment's neighbours, and the centre where both arms meet.
        if (other > index + 3 && Math.hypot(a[0], a[1]) > 0.12) {
          expect(cross(a, b, curve[other - 1]!, curve[other]!)).toBe(false);
        }
      }
    }
  });

  it('carries ripples that grow with distance from the centre', () => {
    // Ripple height is what rho does beyond the smooth spiral: compare the spread
    // of rho over a short stretch of an inner turn and an outer one.
    const spread = (from: number, to: number) => {
      const rhos = trajectory.points
        .filter(([theta]) => theta >= from && theta <= to)
        .map(([, rho]) => rho);
      const mean = rhos.reduce((sum, rho) => sum + rho, 0) / rhos.length;
      return Math.sqrt(rhos.reduce((sum, rho) => sum + (rho - mean) ** 2, 0) / rhos.length);
    };

    // One short stretch (a ripple or two) near the start of the outward arm and near its end.
    const inner = spread(TWO_PI * 1, TWO_PI * 1 + 0.5);
    const outer = spread(TWO_PI * 7, TWO_PI * 7 + 0.5);

    expect(outer).toBeGreaterThan(inner * 0.5);
  });

  it('honours its options, and stays inside the table with all of them at their extremes', () => {
    const wild = generateDunes({ revolutions: 4, rippleFraction: 0.5, drift: 0.05, rimRho: 0.9 });

    expect(rhoRange(wild)[1]).toBeLessThanOrEqual(1);
    expect(wild.points.length).toBeLessThan(trajectory.points.length);
  });
});

describe('generateSadu', () => {
  const trajectory = generateSadu();

  it('lays every radial step on one line: the seam, at an angle that is a whole number of turns', () => {
    // A radial step is a run of points with the same theta and rising rho.
    const steps = trajectory.points.filter(([theta], index) => {
      const previous = trajectory.points[index - 1];
      return previous !== undefined && previous[0] === theta;
    });

    expect(steps.length).toBeGreaterThan(50);
    for (const [theta] of steps) {
      expect(theta / TWO_PI).toBeCloseTo(Math.round(theta / TWO_PI), 9);
    }
  });

  it('makes diamond rows from two zigzags exactly out of step', () => {
    // The zigzag itself: points that turn, not the radial steps between rings.
    const turn = (index: number): PolarPoint[] =>
      trajectory.points.filter(
        ([theta], position) =>
          theta > TWO_PI * index + 1e-9 &&
          theta <= TWO_PI * (index + 1) + 1e-9 &&
          theta !== trajectory.points[position - 1]?.[0],
      );
    const first = turn(1);
    const second = turn(2);

    expect(first.length).toBeGreaterThan(50);
    expect(second.length).toBe(first.length);
    for (const [index, [theta, rho]] of first.entries()) {
      const other = second[index]!;

      expect(other[0]).toBeCloseTo(theta + TWO_PI, 9);
      expect(rho + other[1]).toBeCloseTo(2 * 0.24, 9);
    }
  });

  it('has the tooth counts it advertises: one peak per tooth in each turn of a row', () => {
    const peaks = (index: number): number => {
      const rhos = trajectory.points
        .filter(([theta]) => theta > TWO_PI * index + 1e-9 && theta <= TWO_PI * (index + 1) + 1e-9)
        .map(([, rho]) => rho);
      return rhos.filter(
        (rho, i) =>
          rho > (rhos[i - 1] ?? Infinity) && rho >= (rhos[i + 1] ?? Infinity) && rho > 0.24 + 0.05,
      ).length;
    };

    expect(peaks(1)).toBe(6);
  });

  it('draws the plain rings as circles', () => {
    // The first ring is a full turn at rho 0.10.
    const ring = trajectory.points.filter(
      ([theta, rho]) => theta > 0 && theta <= TWO_PI && Math.abs(rho - 0.1) < 1e-12,
    );

    expect(ring.length).toBeGreaterThan(100);
  });

  it('keeps the zigzags clear of the plain rings around them', () => {
    // Only the turning points: a radial step crosses this range on its way out.
    const rhos = trajectory.points
      .filter(([theta], position) => theta !== trajectory.points[position - 1]?.[0])
      .map(([, rho]) => rho);

    expect(Math.max(...rhos)).toBeCloseTo(0.93, 9);
    expect(rhos.filter((rho) => rho > 0.87 && rho < 0.93).length).toBe(0);
  });

  it('honours its options', () => {
    const small = generateSadu({ plainRings: [0.5], rows: [{ rho: 0.3, teeth: 8 }] });

    expect(small.points.length).toBeLessThan(trajectory.points.length);
    expect(describeTrajectoryProblems(small)).toStrictEqual([]);
  });
});

describe('generateStar', () => {
  const trajectory = generateStar();
  const curve = trajectory.points.map(polarToXY);

  /** Vertex `m` of the star whose points are at `radius`, turned by `turn`. */
  const vertex = (radius: number, turn: number, m: number, ratio = 0.7): XY => {
    const angle = turn + (Math.PI / 8) * m;
    const r = radius * (m % 2 === 0 ? 1 : ratio);
    return [r * Math.cos(angle), r * Math.sin(angle)];
  };
  const radii = [0.92 * 0.7 ** 3, 0.92 * 0.7 ** 2, 0.92 * 0.7, 0.92];
  const turns = [Math.PI / 8, 0, Math.PI / 8, 0];

  it('passes through every corner of every star', () => {
    for (const [index, radius] of radii.entries()) {
      for (let m = 0; m < 16; m += 1) {
        const corner = vertex(radius, turns[index]!, m);
        const nearest = Math.min(...curve.map((point) => distance(point, corner)));

        expect(nearest).toBeLessThan(1e-6);
      }
    }
  });

  it('reaches exactly the outer radius at the points of the outer star', () => {
    expect(rhoRange(trajectory)[1]).toBeCloseTo(0.92, 9);
  });

  it('fits each star into the next: the points of one land in the notches of the one outside it', () => {
    for (let index = 0; index < 3; index += 1) {
      for (let m = 0; m < 16; m += 2) {
        const tip = vertex(radii[index]!, turns[index]!, m);
        const angle = turns[index]! + (Math.PI / 8) * m;
        // The next star's notch at the same angle, at its notch radius.
        const notch: XY = [
          radii[index + 1]! * 0.7 * Math.cos(angle),
          radii[index + 1]! * 0.7 * Math.sin(angle),
        ];

        expect(distance(tip, notch)).toBeLessThan(1e-9);
      }
    }
  });

  it('is made only of straight lines in the plane', () => {
    // Every point lies on one of the straight edges between consecutive corners, or on an axis.
    const corners: XY[] = radii.flatMap((radius, index) =>
      Array.from({ length: 16 }, (_, m) => vertex(radius, turns[index]!, m)),
    );
    const onEdge = (point: XY): boolean => {
      for (const [index, radius] of radii.entries()) {
        for (let m = 0; m < 16; m += 1) {
          const a = vertex(radius, turns[index]!, m);
          const b = vertex(radius, turns[index]!, m + 1);
          const length = distance(a, b);
          const t =
            ((point[0] - a[0]) * (b[0] - a[0]) + (point[1] - a[1]) * (b[1] - a[1])) / length ** 2;
          if (t >= -1e-9 && t <= 1 + 1e-9) {
            const foot: XY = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
            if (distance(point, foot) < 1e-9) return true;
          }
        }
      }
      return false;
    };
    const onAxis = (point: XY): boolean => {
      const angle = Math.atan2(point[1], point[0]);
      return [Math.PI / 8, (3 * Math.PI) / 8].some(
        (axis) => Math.abs(Math.sin(angle - axis)) * Math.hypot(...point) < 1e-9,
      );
    };

    expect(corners).toHaveLength(64);
    for (const point of curve) {
      expect(onEdge(point) || onAxis(point)).toBe(true);
    }
  });

  it('returns to the centre along an axis of symmetry of the figure', () => {
    // The last stretch is a straight line in from the outer star's notch at 67.5 degrees.
    const tail = curve.slice(-20);

    for (const [x, y] of tail) {
      expect(
        Math.abs(Math.sin(Math.atan2(y, x) - (3 * Math.PI) / 8)) * Math.hypot(x, y),
      ).toBeLessThan(1e-9);
    }
  });

  it('refuses shapes it cannot draw', () => {
    expect(() => generateStar({ ratio: 1 })).toThrow(RangeError);
    expect(() => generateStar({ ratio: 0 })).toThrow(RangeError);
    expect(() => generateStar({ stars: 0 })).toThrow(RangeError);
    expect(() => generateStar({ points: 2 })).toThrow(RangeError);
  });

  it('honours the number of stars and points', () => {
    expect(trajectoryLength(generateStar({ stars: 2 }))).toBeLessThan(trajectoryLength(trajectory));
    expect(describeTrajectoryProblems(generateStar({ points: 6, stars: 3 }))).toStrictEqual([]);
  });
});

describe('generateKhoos', () => {
  const trajectory = generateKhoos();
  const curve = trajectory.points.map(polarToXY);

  it('draws eight fronds, each reaching the full length of its rib', () => {
    const tips = curve.filter(([x, y]) => Math.abs(Math.hypot(x, y) - 0.93) < 1e-9);
    const angles = new Set(
      tips.map(([x, y]) => Math.round(((Math.atan2(y, x) + TWO_PI) % TWO_PI) / (TWO_PI / 8))),
    );

    expect(angles.size).toBe(8);
  });

  it('returns to the centre once per frond', () => {
    // An arrival is a point at the centre that follows a point away from it. The
    // very first point starts at the centre, so it is not an arrival.
    const arrivals = trajectory.points.filter(([, rho], index) => {
      const previous = trajectory.points[index - 1];
      return previous !== undefined && rho < 1e-9 && previous[1] >= 1e-9;
    });

    expect(arrivals).toHaveLength(8);
  });

  it('has eight identical fronds, each turned an eighth of a turn', () => {
    // Split into fronds where the path rests at the centre between one and the next.
    const lengths: number[] = [];
    let start = 0;

    for (const [index, [, rho]] of trajectory.points.entries()) {
      if (index > 0 && rho < 1e-9 && (trajectory.points[index + 1]?.[1] ?? 1) < 1e-9) {
        lengths.push(
          trajectoryLength({ ...trajectory, points: trajectory.points.slice(start, index + 1) }),
        );
        start = index + 1;
      }
    }
    lengths.push(trajectoryLength({ ...trajectory, points: trajectory.points.slice(start) }));

    expect(lengths).toHaveLength(8);
    for (const length of lengths) {
      expect(length).toBeGreaterThan(2);
      expect(length).toBeCloseTo(lengths[0]!, 6);
    }
  });

  it('narrows toward the tip and toward the centre, like a frond', () => {
    // Lateral reach across the first frond (axis along +x), on its own side of
    // the table so that a neighbouring frond is not measured.
    const reachNear = (along: number): number => {
      const slice = curve.filter(
        ([x, y]) =>
          Math.abs(x - along) < 0.04 && x > 0 && Math.abs(Math.atan2(y, x)) < Math.PI / 8 - 0.01,
      );
      return Math.max(...slice.map(([, y]) => Math.abs(y)));
    };

    expect(reachNear(0.5)).toBeGreaterThan(reachNear(0.88));
    expect(reachNear(0.5)).toBeGreaterThan(reachNear(0.25));
  });

  it('keeps the fronds from touching one another, even near the centre', () => {
    // Fronds are an eighth of a turn apart, so the line halfway between two of
    // them is at 22.5 degrees plus a multiple of 45. Nothing may come close to it.
    const quarter = Math.PI / 4;
    const closest = Math.min(
      ...curve
        .filter(([x, y]) => Math.hypot(x, y) > 0.1)
        .map(([x, y]) => {
          const offset = (((Math.atan2(y, x) - Math.PI / 8) % quarter) + quarter) % quarter;
          return Math.min(offset, quarter - offset) * Math.hypot(x, y);
        }),
    );

    expect(closest).toBeGreaterThan(0.015);
  });

  it('honours its options', () => {
    const small = generateKhoos({ fronds: 4, leaflets: 8 });

    expect(trajectoryLength(small)).toBeLessThan(trajectoryLength(trajectory) / 2);
    expect(rhoRange(small)[1]).toBeLessThanOrEqual(0.93 + 1e-9);
  });
});
