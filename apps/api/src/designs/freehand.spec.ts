import { describe, expect, it } from 'vitest';
import { trajectoryLength, type PolarPoint } from '../device/trajectory.js';
import { trajectoryProblems } from './design-collection.js';
import { CENTRE_SNAP_RHO, freehandTrajectory } from './freehand.js';
import { distance, polarToXY } from './geometry.js';
import { HOME_RHO } from './home.js';

/** A small deterministic generator, so a failure can be replayed. */
function random(seed: number): () => number {
  let state = seed;

  return () => {
    state = (state * 1664525 + 1013904223) % 2 ** 32;
    return state / 2 ** 32;
  };
}

describe('a freehand path', () => {
  it('gains a lead-in from home and a return home when it ends elsewhere', () => {
    const path: PolarPoint[] = [
      [0, 0.5],
      [1, 0.8],
      [2, 0.6],
    ];
    const { points } = freehandTrajectory(path);

    expect(trajectoryProblems({ format: 'polar-theta-rho/v1', points })).toStrictEqual([]);
    expect(points[0]?.[1]).toBe(HOME_RHO);
    expect(points.at(-1)?.[1]).toBe(HOME_RHO);
    // Every point the owner drew is on the trajectory.
    for (const point of path) {
      const nearest = Math.min(
        ...points.map((drawn) => distance(polarToXY(drawn), polarToXY(point))),
      );
      expect(nearest).toBeLessThan(1e-9);
    }
  });

  it('adds nothing past a path that already ends at home', () => {
    const trajectory = freehandTrajectory([
      [0, 0.5],
      [0, 0],
    ]);

    expect(trajectory.points.at(-1)).toStrictEqual([0, 0]);
    // Out 0.5 (the lead-in) and back 0.5 (the stroke): no return segment added.
    expect(trajectoryLength(trajectory)).toBeCloseTo(1, 9);
  });

  it('accepts far-apart points on the rim and lines through or near the centre', () => {
    const paths: PolarPoint[][] = [
      [
        [0, 1],
        [Math.PI, 1],
        [Math.PI / 2, 1],
        [-Math.PI / 2, 1],
      ],
      [
        [0, 0.9],
        [Math.PI + 0.01, 0.9],
      ],
      [
        [0, 0.5],
        [0, 0],
        [3, 0.5],
      ],
    ];

    for (const path of paths) {
      expect(trajectoryProblems(freehandTrajectory(path))).toStrictEqual([]);
    }
  });

  it('turns any reasonable finger stroke into a valid trajectory', () => {
    const next = random(42);

    for (let stroke = 0; stroke < 200; stroke += 1) {
      const path: PolarPoint[] = Array.from({ length: 2 + Math.floor(next() * 30) }, () => [
        next() * 20 - 10,
        // Bias some points close to the centre, the hard case.
        next() < 0.3 ? next() * CENTRE_SNAP_RHO * 3 : next(),
      ]);

      expect(trajectoryProblems(freehandTrajectory(path))).toStrictEqual([]);
    }
  });
});
