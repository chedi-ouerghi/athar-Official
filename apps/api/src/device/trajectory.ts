/**
 * Trajectories in the `polar-theta-rho/v1` convention, and the path-length
 * rules that go with them (docs/architecture.md, "Trajectory" and "Preview
 * path").
 *
 * A trajectory is an ordered list of `[theta, rho]` points. `theta` is in
 * radians and **unwrapped** (it may exceed 2*pi and keep increasing); `rho` is
 * the distance from the table centre as a fraction of the table radius, 0 at
 * the centre and 1 at the edge. Consecutive points are joined by linear
 * interpolation **in polar space**: between two points, rho changes linearly
 * with theta, which draws an Archimedean spiral segment (a circular arc when
 * rho is constant, a straight radial line when theta is constant).
 *
 * This is a proposal that is still to be validated against the chosen
 * mechanics. If the format changes, this file changes and nothing above the
 * driver does.
 */

import {
  cumulativePathLengths,
  locateAlongPath,
  polarPathLength,
  polarSegmentLength,
  type PolarPoint,
} from '@athar/contracts';

export const TRAJECTORY_FORMAT = 'polar-theta-rho/v1' as const;

export type { PolarPoint };

export interface Trajectory {
  readonly format: typeof TRAJECTORY_FORMAT;
  readonly points: readonly PolarPoint[];
}

/** Below this, a trajectory is treated as having no length at all. */
const MIN_TOTAL_LENGTH = 1e-9;

/**
 * The path-length rules live in `@athar/contracts` (`polar-path.ts`), because the
 * app applies the same rule to a preview path. Re-exported so API code keeps one
 * import for everything about a trajectory.
 */
export { cumulativePathLengths, polarSegmentLength };

/** Total length of a trajectory, in table-radius units. */
export function trajectoryLength(trajectory: Trajectory): number {
  return polarPathLength(trajectory.points);
}

/**
 * The point reached after drawing `progress` (0..1) of the total path length.
 * See `locateAlongPath` for the rule.
 */
export function pointAtProgress(trajectory: Trajectory, progress: number): PolarPoint {
  return locateAlongPath(trajectory.points, progress).point;
}

/**
 * Reasons a trajectory cannot be drawn, or an empty list if it can.
 *
 * Checked on every start, because a driver must reject a bad trajectory with a
 * clear reason rather than draw nonsense or divide by zero later.
 */
export function describeTrajectoryProblems(trajectory: Trajectory): string[] {
  const problems: string[] = [];

  if ((trajectory.format as string) !== TRAJECTORY_FORMAT) {
    problems.push(`Unsupported trajectory format "${String(trajectory.format)}".`);
    return problems;
  }

  if (trajectory.points.length < 2) {
    problems.push('A trajectory needs at least two points.');
    return problems;
  }

  for (const [index, [theta, rho]] of trajectory.points.entries()) {
    if (!Number.isFinite(theta) || !Number.isFinite(rho)) {
      problems.push(`Point ${index} is not a finite number.`);
    } else if (rho < 0 || rho > 1) {
      problems.push(`Point ${index} has rho ${rho}, outside 0..1.`);
    }
  }

  if (problems.length === 0 && trajectoryLength(trajectory) < MIN_TOTAL_LENGTH) {
    problems.push('The trajectory has no length.');
  }

  return problems;
}
