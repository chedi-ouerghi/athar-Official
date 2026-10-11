import { describe, expect, it } from 'vitest';
import {
  LINE_STEP,
  PolarPathBuilder,
  TWO_PI,
  nearestAngle,
  smoothstep,
  triangleWave,
} from './path-builder.js';

/** Distance from `point` to the line through `a` and `b`. */
function distanceToLine(
  [px, py]: [number, number],
  [ax, ay]: [number, number],
  [bx, by]: [number, number],
): number {
  return Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / Math.hypot(bx - ax, by - ay);
}

describe('nearestAngle', () => {
  it('picks the equivalent angle closest to the reference', () => {
    expect(nearestAngle(0.1, 0)).toBeCloseTo(0.1, 12);
    expect(nearestAngle(0.1, TWO_PI)).toBeCloseTo(TWO_PI + 0.1, 12);
    expect(nearestAngle(0.1, -TWO_PI)).toBeCloseTo(-TWO_PI + 0.1, 12);
    expect(nearestAngle(-3, 3)).toBeCloseTo(-3 + TWO_PI, 12);
  });

  it('is never more than half a turn from the reference', () => {
    for (let reference = -20; reference <= 20; reference += 0.7) {
      for (let angle = -Math.PI; angle <= Math.PI; angle += 0.3) {
        expect(Math.abs(nearestAngle(angle, reference) - reference)).toBeLessThanOrEqual(
          Math.PI + 1e-9,
        );
      }
    }
  });
});

describe('smoothstep', () => {
  it('is 0 below the start, 1 above the end, and rises smoothly between', () => {
    expect(smoothstep(-1)).toBe(0);
    expect(smoothstep(0)).toBe(0);
    expect(smoothstep(0.5)).toBe(0.5);
    expect(smoothstep(1)).toBe(1);
    expect(smoothstep(2)).toBe(1);
    expect(smoothstep(0.25)).toBeLessThan(0.25);
    expect(smoothstep(0.75)).toBeGreaterThan(0.75);
  });

  it('takes other edges', () => {
    expect(smoothstep(5, 0, 10)).toBe(0.5);
    expect(smoothstep(0.1, 0.2, 0.4)).toBe(0);
  });
});

describe('triangleWave', () => {
  it('has period 2*pi, amplitude 1 and is made of straight lines', () => {
    expect(triangleWave(0)).toBeCloseTo(0, 12);
    expect(triangleWave(Math.PI / 2)).toBeCloseTo(1, 12);
    expect(triangleWave(-Math.PI / 2)).toBeCloseTo(-1, 12);
    expect(triangleWave(Math.PI)).toBeCloseTo(0, 12);
    expect(triangleWave(1.234 + TWO_PI)).toBeCloseTo(triangleWave(1.234), 12);

    // Straight: equal steps in phase give equal steps in value on a rising edge.
    const rise = [0.1, 0.2, 0.3, 0.4].map(triangleWave);
    expect(rise[1]! - rise[0]!).toBeCloseTo(rise[3]! - rise[2]!, 12);
  });

  it('never leaves -1..1', () => {
    for (let phase = -30; phase <= 30; phase += 0.37) {
      expect(Math.abs(triangleWave(phase))).toBeLessThanOrEqual(1 + 1e-12);
    }
  });
});

describe('PolarPathBuilder', () => {
  it('throws if asked for the last point of an empty path', () => {
    expect(() => new PolarPathBuilder().last).toThrow(RangeError);
  });

  it('builds a polar-theta-rho/v1 trajectory from the points it was given', () => {
    const trajectory = new PolarPathBuilder().polar(0, 0).polar(1, 0.5).build();

    expect(trajectory).toStrictEqual({
      format: 'polar-theta-rho/v1',
      points: [
        [0, 0],
        [1, 0.5],
      ],
    });
  });

  describe('lineTo', () => {
    it('draws a straight line, in steps no longer than the step size', () => {
      const path = new PolarPathBuilder().polar(0, 0).lineTo(0.6, 0.3);
      const { points } = path.build();
      const end = points.at(-1)!;

      expect(end[1]).toBeCloseTo(Math.hypot(0.6, 0.3), 12);
      expect(end[0]).toBeCloseTo(Math.atan2(0.3, 0.6), 12);

      let previous: [number, number] = [0, 0];
      for (const [theta, rho] of points) {
        const point: [number, number] = [rho * Math.cos(theta), rho * Math.sin(theta)];
        expect(distanceToLine(point, [0, 0], [0.6, 0.3])).toBeLessThan(1e-12);
        expect(Math.hypot(point[0] - previous[0], point[1] - previous[1])).toBeLessThanOrEqual(
          LINE_STEP + 1e-12,
        );
        previous = point;
      }
    });

    it('keeps theta unwrapped as a line sweeps round the centre', () => {
      // From the right of the table, past the top, to the left: the angle goes from 0
      // to about pi and must not jump to -pi at the far side.
      const path = new PolarPathBuilder().polar(0, 0.5).lineTo(-0.5, 0.2);
      const thetas = path.build().points.map(([theta]) => theta);

      for (const [index, theta] of thetas.entries()) {
        expect(Math.abs(theta - (thetas[index - 1] ?? theta))).toBeLessThan(0.2);
      }
      expect(thetas.at(-1)).toBeGreaterThan(Math.PI / 2);
    });

    it('carries on winding in the same direction past a full turn', () => {
      const path = new PolarPathBuilder().polar(0, 0.5);

      for (let corner = 1; corner <= 12; corner += 1) {
        const angle = (corner * Math.PI) / 3; // twelve sixths of a turn: two full turns
        path.lineTo(0.5 * Math.cos(angle), 0.5 * Math.sin(angle));
      }

      expect(path.last[0]).toBeCloseTo(2 * TWO_PI, 6);
    });

    it('keeps its angle through the exact centre', () => {
      const path = new PolarPathBuilder().polar(1.2, 0.3).lineTo(0, 0);

      expect(path.last[1]).toBeLessThan(1e-9);
      expect(path.last[0]).toBeCloseTo(1.2, 9);
    });
  });

  describe('radialTo', () => {
    it('moves along a radius without turning, in short steps', () => {
      const { points } = new PolarPathBuilder().polar(2, 0.1).radialTo(0.9).build();

      expect(points.every(([theta]) => theta === 2)).toBe(true);
      expect(points.at(-1)).toStrictEqual([2, 0.9]);
      for (const [index, [, rho]] of points.entries()) {
        expect(Math.abs(rho - (points[index - 1]?.[1] ?? rho))).toBeLessThanOrEqual(
          LINE_STEP + 1e-12,
        );
      }
    });

    it('can move inward too', () => {
      expect(new PolarPathBuilder().polar(0, 0.9).radialTo(0).last).toStrictEqual([0, 0]);
    });
  });

  describe('curve', () => {
    it('follows rho(theta) from where the path is to the end angle', () => {
      const { points } = new PolarPathBuilder()
        .polar(0, 0)
        .curve(TWO_PI, (theta) => theta / TWO_PI, 0.1)
        .build();

      expect(points.at(-1)).toStrictEqual([TWO_PI, 1]);
      for (const [theta, rho] of points) {
        expect(rho).toBeCloseTo(theta / TWO_PI, 12);
      }
    });

    it('can run backwards', () => {
      const { points } = new PolarPathBuilder()
        .polar(TWO_PI, 1)
        .curve(0, (theta) => theta / TWO_PI, 0.1)
        .build();

      expect(points.at(-1)).toStrictEqual([0, 0]);
    });
  });
});
