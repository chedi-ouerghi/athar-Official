/**
 * Building blocks for the design generators.
 *
 * Every design is produced by a small pure function that draws with these
 * helpers, never from a typed-in list of points. The builder keeps theta
 * **unwrapped** (it keeps increasing or decreasing through a turn instead of
 * jumping at 2*pi) and keeps points close enough together that the table's
 * linear-in-polar-space interpolation reproduces the intended shape.
 */

import { TRAJECTORY_FORMAT, type PolarPoint, type Trajectory } from '../../device/trajectory.js';

export const TWO_PI = 2 * Math.PI;

/** Longest straight stretch between two points the builder emits, in table radii. */
export const LINE_STEP = 0.01;

/** The angle equal to `angle` (mod 2*pi) that lies within pi of `reference`. */
export function nearestAngle(angle: number, reference: number): number {
  return angle + TWO_PI * Math.round((reference - angle) / TWO_PI);
}

/** 0 up to `edge0`, 1 from `edge1`, and a smooth rise between them. */
export function smoothstep(value: number, edge0 = 0, edge1 = 1): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));

  return t * t * (3 - 2 * t);
}

/** A triangle wave with period 2*pi and amplitude 1, made of straight rises and falls. */
export function triangleWave(phase: number): number {
  return (2 / Math.PI) * Math.asin(Math.sin(phase));
}

export class PolarPathBuilder {
  private readonly points: [number, number][] = [];

  /** The last point drawn. */
  get last(): PolarPoint {
    const point = this.points.at(-1);

    if (point === undefined) {
      throw new RangeError('Nothing has been drawn yet.');
    }

    return point;
  }

  /** Add a point exactly as given. */
  polar(theta: number, rho: number): this {
    this.points.push([theta, rho]);

    return this;
  }

  /**
   * Draw a straight line to a Cartesian position, as many short steps. Theta
   * follows on from where the path was, so a line that sweeps round the table
   * keeps winding in one direction.
   */
  lineTo(x: number, y: number, step = LINE_STEP): this {
    const [theta0, rho0] = this.last;
    const startX = rho0 * Math.cos(theta0);
    const startY = rho0 * Math.sin(theta0);
    const steps = Math.max(1, Math.ceil(Math.hypot(x - startX, y - startY) / step));
    let theta = theta0;

    for (let index = 1; index <= steps; index += 1) {
      const t = index / steps;
      const px = startX + (x - startX) * t;
      const py = startY + (y - startY) * t;
      const rho = Math.hypot(px, py);

      // At the very centre the angle is undefined: keep the one we had.
      theta = rho < 1e-9 ? theta : nearestAngle(Math.atan2(py, px), theta);
      this.points.push([theta, rho]);
    }

    return this;
  }

  /** Move straight in or out to `rho` without turning. */
  radialTo(rho: number, step = LINE_STEP): this {
    const [theta, rho0] = this.last;
    const steps = Math.max(1, Math.ceil(Math.abs(rho - rho0) / step));

    for (let index = 1; index <= steps; index += 1) {
      this.points.push([theta, rho0 + ((rho - rho0) * index) / steps]);
    }

    return this;
  }

  /**
   * Draw a curve given as `rho(theta)`, sampling theta from where the path now
   * is to `thetaEnd`, in steps of at most `maxThetaStep`.
   */
  curve(thetaEnd: number, rhoAt: (theta: number) => number, maxThetaStep: number): this {
    const [thetaStart] = this.last;
    // The small allowance keeps a division that should come out whole, such as one
    // turn over a sixty-fourth of a turn, from rounding up by one on floating-point error.
    const steps = Math.max(1, Math.ceil(Math.abs(thetaEnd - thetaStart) / maxThetaStep - 1e-9));

    for (let index = 1; index <= steps; index += 1) {
      const theta = thetaStart + ((thetaEnd - thetaStart) * index) / steps;
      this.points.push([theta, rhoAt(theta)]);
    }

    return this;
  }

  build(): Trajectory {
    return { format: TRAJECTORY_FORMAT, points: this.points.map(([theta, rho]) => [theta, rho]) };
  }
}
