import { describe, expect, it } from 'vitest';
import {
  TRAJECTORY_FORMAT,
  describeTrajectoryProblems,
  pointAtProgress,
  trajectoryLength,
  type PolarPoint,
  type Trajectory,
} from './trajectory.js';

const TWO_PI = 2 * Math.PI;

function trajectory(...points: PolarPoint[]): Trajectory {
  return { format: TRAJECTORY_FORMAT, points };
}

describe('trajectoryLength and pointAtProgress', () => {
  it('apply the shared path rules to a trajectory', () => {
    const t = trajectory([0, 0], [0, 1], [3, 1]);

    // A radial line of length 1, then an arc of length 3.
    expect(trajectoryLength(t)).toBeCloseTo(4, 12);
    expect(pointAtProgress(t, 0.25)).toStrictEqual([0, 1]);
  });
});

describe('describeTrajectoryProblems', () => {
  it('accepts a drawable trajectory', () => {
    expect(describeTrajectoryProblems(trajectory([0, 0], [TWO_PI, 1]))).toStrictEqual([]);
  });

  it('rejects an unknown format', () => {
    const unknown = { format: 'cartesian/v9', points: [] } as unknown as Trajectory;

    expect(describeTrajectoryProblems(unknown)[0]).toContain('format');
  });

  it('rejects fewer than two points', () => {
    expect(describeTrajectoryProblems(trajectory([0, 0.5]))[0]).toContain('two points');
    expect(describeTrajectoryProblems(trajectory())[0]).toContain('two points');
  });

  it('rejects a rho outside the table, and names the point', () => {
    expect(describeTrajectoryProblems(trajectory([0, 0], [1, 1.2]))[0]).toContain('Point 1');
    expect(describeTrajectoryProblems(trajectory([0, -0.1], [1, 1]))[0]).toContain('Point 0');
  });

  it('rejects points that are not finite numbers', () => {
    expect(describeTrajectoryProblems(trajectory([0, 0], [Number.NaN, 0.5]))).not.toHaveLength(0);
    expect(describeTrajectoryProblems(trajectory([0, 0], [1, Infinity]))).not.toHaveLength(0);
  });

  it('rejects a trajectory with no length', () => {
    expect(describeTrajectoryProblems(trajectory([1, 0.5], [1, 0.5]))[0]).toContain('no length');
  });
});
