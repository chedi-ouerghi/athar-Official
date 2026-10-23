/**
 * Converts a `polar-theta-rho/v1` trajectory (from `@athar/contracts`) into
 * relative G-code (`G91`), following the conventions written down in
 * `hardware/board/config.yaml` and `hardware/table-agent/agent.example.yaml`:
 *
 * - Board axis **X = theta, in degrees** (unwrapped — the arm turns freely).
 * - Board axis **Y = rho, in real millimetres** of the carriage on the arm.
 * - `rho` is clamped to `1 - rhoMargin` so the ball never reaches the edge.
 * - A carriage whose rho motor is fixed to the frame drifts as the arm turns:
 *   `Y_cmd = rho_mm + couplingMmPerDeg * theta_deg` corrects for it.
 * - Long steps in theta are cut into pieces no larger than `segmentMaxDeg`,
 *   by linear interpolation in polar space — the same interpolation the
 * `   trajectory itself is defined with (`polar-path.ts`).
 * - The feed rate of each G-code segment is chosen so the **ball** moves at a
 *   constant `ballSpeedMmS` through the sand, capped so theta never turns
 *   faster than `maxThetaDegPerS`.
 *
 * Pure functions: no I/O, no board, easy to property-test.
 */

import { cumulativePathLengths, polarSegmentLength, type PolarPoint } from '@athar/contracts';

const RAD_TO_DEG = 180 / Math.PI;

export interface GcodeGeometry {
  readonly radiusMm: number;
  readonly rhoMargin: number;
  readonly couplingMmPerDeg: number;
}

export interface GcodeMotion {
  readonly ballSpeedMmS: number;
  readonly maxThetaDegPerS: number;
  readonly segmentMaxDeg: number;
}

export interface GcodeSegment {
  /** A relative move: `G1 X<dtheta_deg> Y<dy_mm> F<feed>`. */
  readonly gcode: string;
  /**
   * Length of the path (`polarPathLength` units: fractions of the table
   * radius) drawn once this segment completes — for progress reporting, using
   * the same definition `apps/api`'s simulated driver and preview use.
   */
  readonly cumulativeLength: number;
}

export interface GcodeMotionPlan {
  /** Total path length in the same units as `cumulativeLength` above. 0 for a motionless trajectory. */
  readonly totalLength: number;
  readonly segments: readonly GcodeSegment[];
}

/**
 * Splits consecutive points so no step exceeds `segmentMaxDeg` of theta,
 * interpolating linearly in polar space (matching how a trajectory's own
 * segments are defined). The original points are always kept.
 */
export function subdividePolarPoints(
  points: readonly PolarPoint[],
  segmentMaxDeg: number,
): PolarPoint[] {
  const result: PolarPoint[] = [];

  for (const [index, point] of points.entries()) {
    result.push(point);
    const next = points[index + 1];

    if (next === undefined) {
      continue;
    }

    const [theta1, rho1] = point;
    const [theta2, rho2] = next;
    const deltaThetaDeg = Math.abs((theta2 - theta1) * RAD_TO_DEG);
    const steps = Math.max(1, Math.ceil(deltaThetaDeg / segmentMaxDeg));

    for (let step = 1; step < steps; step += 1) {
      const t = step / steps;
      result.push([theta1 + (theta2 - theta1) * t, rho1 + (rho2 - rho1) * t]);
    }
  }

  return result;
}

/** `rho` clamped so the ball never reaches the physical edge. */
export function clampRho(rho: number, geometry: Pick<GcodeGeometry, 'rhoMargin'>): number {
  return Math.min(Math.max(rho, 0), 1 - geometry.rhoMargin);
}

/** The board's Y command (real millimetres) for a point, including the arm/carriage coupling correction. */
export function yCommandMm(
  thetaDeg: number,
  rho: number,
  geometry: Pick<GcodeGeometry, 'radiusMm' | 'rhoMargin' | 'couplingMmPerDeg'>,
): number {
  return clampRho(rho, geometry) * geometry.radiusMm + geometry.couplingMmPerDeg * thetaDeg;
}

/**
 * Builds the full streaming plan for a trajectory: subdivides it, then emits
 * one relative G-code line per step with a feed rate chosen for a constant
 * ball speed (see module doc). Degenerate (zero-length) steps are dropped.
 */
export function planGcodeMotion(
  points: readonly PolarPoint[],
  geometry: GcodeGeometry,
  motion: GcodeMotion,
): GcodeMotionPlan {
  const subdivided = subdividePolarPoints(points, motion.segmentMaxDeg);
  // Progress is reported against the *requested* path length (unclamped rho),
  // the same definition `apps/api`'s simulated driver and the app's preview
  // use. The feed-rate math below uses the margin-clamped rho instead, because
  // that is where the ball actually goes.
  const lengths = cumulativePathLengths(subdivided);
  const totalLength = lengths.at(-1) ?? 0;
  const segments: GcodeSegment[] = [];

  let previous: {
    readonly theta: number;
    readonly thetaDeg: number;
    readonly rho: number;
    readonly yCmd: number;
  } | null = null;

  for (const [index, [theta, rho]] of subdivided.entries()) {
    const thetaDeg = theta * RAD_TO_DEG;
    const clamped = clampRho(rho, geometry);
    const yCmd = clamped * geometry.radiusMm + geometry.couplingMmPerDeg * thetaDeg;

    if (previous !== null) {
      const deltaThetaDeg = thetaDeg - previous.thetaDeg;
      const deltaYMm = yCmd - previous.yCmd;
      const machineDistance = Math.hypot(deltaThetaDeg, deltaYMm);

      if (machineDistance > 1e-9) {
        const dsMm =
          polarSegmentLength([previous.theta, previous.rho], [theta, clamped]) * geometry.radiusMm;
        const dtSeconds = Math.max(
          dsMm / motion.ballSpeedMmS,
          Math.abs(deltaThetaDeg) / motion.maxThetaDegPerS,
        );
        const feedPerMin = dtSeconds > 0 ? (machineDistance / dtSeconds) * 60 : 0;

        segments.push({
          gcode: `G1 X${deltaThetaDeg.toFixed(4)} Y${deltaYMm.toFixed(4)} F${feedPerMin.toFixed(2)}`,
          cumulativeLength: lengths[index] ?? totalLength,
        });
      }
    }

    previous = { theta, thetaDeg, rho: clamped, yCmd };
  }

  return { totalLength, segments };
}
