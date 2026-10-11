/**
 * Path length over polar paths in the `polar-theta-rho/v1` convention.
 *
 * This is the one definition of "how long is a path" shared by the driver (which
 * reports progress as a fraction of the trajectory's length) and the app (which
 * draws the part of `previewPath` completed so far). Both must agree, so neither
 * owns a copy. Pure data in, data out: no framework, no I/O.
 *
 * A path is an ordered list of `[theta, rho]` points. `theta` is in radians and
 * **unwrapped** (it may exceed 2*pi and keep increasing); `rho` is the distance
 * from the table centre as a fraction of the table radius. Consecutive points are
 * joined by linear interpolation **in polar space**: between two points, rho
 * changes linearly with theta, which draws an Archimedean spiral segment (a
 * circular arc when rho is constant, a straight radial line when theta is
 * constant).
 */

/** One point of a polar path. */
export type PolarPoint = readonly [theta: number, rho: number];

/**
 * Below this slope (change in rho per radian) the closed form below loses
 * precision to cancellation, and a mean-radius arc is used instead. The two
 * agree to well under 1e-6 there.
 */
const SMALL_SLOPE = 1e-3;

/**
 * Length of the curve drawn between two points, in table-radius units.
 *
 * Along the segment `r(phi) = r1 + k * (phi - theta1)` with
 * `k = deltaRho / deltaTheta`, so the physical arc length is the integral of
 * `sqrt(r^2 + k^2)` over phi. Substituting `u = r` gives the closed form
 * `[u * sqrt(u^2 + k^2) + k^2 * asinh(u / |k|)] / (2|k|)` evaluated between
 * `rho1` and `rho2`. The two degenerate cases are exact: no rotation is a
 * radial line (`|deltaRho|`), and no radial change is a circular arc
 * (`rho * |deltaTheta|`).
 */
export function polarSegmentLength(from: PolarPoint, to: PolarPoint): number {
  const [theta1, rho1] = from;
  const [theta2, rho2] = to;
  const deltaTheta = theta2 - theta1;
  const deltaRho = rho2 - rho1;

  if (deltaTheta === 0) {
    return Math.abs(deltaRho);
  }

  if (deltaRho === 0) {
    return rho1 * Math.abs(deltaTheta);
  }

  const slope = Math.abs(deltaRho / deltaTheta);

  if (slope < SMALL_SLOPE) {
    const meanRho = (rho1 + rho2) / 2;
    return Math.hypot(meanRho * deltaTheta, deltaRho);
  }

  const antiderivative = (u: number): number =>
    u * Math.sqrt(u * u + slope * slope) + slope * slope * Math.asinh(u / slope);

  return Math.abs(antiderivative(rho2) - antiderivative(rho1)) / (2 * slope);
}

/**
 * Cumulative path length at every point. The result has one entry per point,
 * starts at 0, and never decreases.
 */
export function cumulativePathLengths(points: readonly PolarPoint[]): number[] {
  const lengths: number[] = [];
  let total = 0;

  for (const [index, point] of points.entries()) {
    const previous = points[index - 1];

    if (previous !== undefined) {
      total += polarSegmentLength(previous, point);
    }

    lengths.push(total);
  }

  return lengths;
}

/** Total length of a path, in table-radius units. */
export function polarPathLength(points: readonly PolarPoint[]): number {
  return cumulativePathLengths(points).at(-1) ?? 0;
}

/** Where `progress` lands on a path. */
export interface PathLocation {
  /** The position reached after drawing `progress` of the total length. */
  readonly point: PolarPoint;
  /**
   * How many leading points of the path lie at or before {@link point}. The part
   * drawn so far is `points.slice(0, passed)` followed by `point`.
   */
  readonly passed: number;
}

/**
 * Locate the position reached after drawing `progress` (0..1) of the total path
 * length.
 *
 * This is the rule behind "progress is path-length based": half of the progress
 * is half of the length, wherever the points happen to be. Inside a segment the
 * position is found exactly, by bisecting on the interpolation parameter,
 * because arc length along a polar-linear segment is not linear in that
 * parameter.
 *
 * @throws RangeError for an empty path.
 */
export function locateAlongPath(points: readonly PolarPoint[], progress: number): PathLocation {
  const first = points[0];
  const last = points.at(-1);

  if (first === undefined || last === undefined) {
    throw new RangeError('A path needs at least one point.');
  }

  const lengths = cumulativePathLengths(points);
  const total = lengths.at(-1) ?? 0;
  const clamped = Math.min(1, Math.max(0, progress));

  if (total === 0 || clamped <= 0) {
    return { point: first, passed: 1 };
  }

  if (clamped >= 1) {
    return { point: last, passed: points.length };
  }

  const target = clamped * total;
  let index = lengths.findIndex((length) => length >= target);

  // `findIndex` can only miss through floating-point error at the very end.
  if (index < 1) {
    index = lengths.length - 1;
  }

  const start = points[index - 1];
  const end = points[index];
  const startLength = lengths[index - 1];

  if (start === undefined || end === undefined || startLength === undefined) {
    return { point: last, passed: points.length };
  }

  const wanted = target - startLength;
  const at = (t: number): PolarPoint => [
    start[0] + (end[0] - start[0]) * t,
    start[1] + (end[1] - start[1]) * t,
  ];

  let low = 0;
  let high = 1;

  for (let step = 0; step < 60; step += 1) {
    const middle = (low + high) / 2;

    if (polarSegmentLength(start, at(middle)) < wanted) {
      low = middle;
    } else {
      high = middle;
    }
  }

  return { point: at((low + high) / 2), passed: index };
}
