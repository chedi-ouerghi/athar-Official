import { describe, expect, it } from 'vitest';
import { polarSegmentLength, type PolarPoint } from '@athar/contracts';
import { clampRho, planGcodeMotion, subdividePolarPoints } from '../src/motion/polar-to-gcode.js';

const RAD_TO_DEG = 180 / Math.PI;

describe('subdividePolarPoints', () => {
  it('keeps the original points and caps every step', () => {
    const points: PolarPoint[] = [[0, 0], [Math.PI, 1]]; // 180 degrees
    const result = subdividePolarPoints(points, 30);

    expect(result[0]).toEqual(points[0]);
    expect(result.at(-1)).toEqual(points[1]);

    for (let index = 1; index < result.length; index += 1) {
      const current = result[index] as PolarPoint;
      const previous = result[index - 1] as PolarPoint;
      const deltaDeg = Math.abs((current[0] - previous[0]) * RAD_TO_DEG);
      expect(deltaDeg).toBeLessThanOrEqual(30 + 1e-9);
    }
  });

  it('adds nothing when the step is already small', () => {
    const points: PolarPoint[] = [[0, 0], [0.1, 0.2]];
    expect(subdividePolarPoints(points, 45)).toHaveLength(2);
  });
});

describe('clampRho', () => {
  it('never exceeds 1 - rhoMargin, and never goes below 0', () => {
    expect(clampRho(1, { rhoMargin: 0.02 })).toBeCloseTo(0.98);
    expect(clampRho(0.5, { rhoMargin: 0.02 })).toBe(0.5);
    expect(clampRho(-1, { rhoMargin: 0.02 })).toBe(0);
  });
});

describe('planGcodeMotion', () => {
  const geometry = { radiusMm: 300, rhoMargin: 0.02, couplingMmPerDeg: 0 };
  const motion = { ballSpeedMmS: 30, maxThetaDegPerS: 60, segmentMaxDeg: 90 };

  it('emits one relative G1 per step, X in degrees and Y in millimetres', () => {
    const points: PolarPoint[] = [[0, 0.5], [Math.PI / 2, 0.5]]; // 90 degrees, constant rho
    const plan = planGcodeMotion(points, geometry, motion);

    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0]?.gcode).toMatch(/^G1 X90\.0000 Y0\.0000 F\d+\.\d\d$/);
  });

  it('chooses a feed rate consistent with a constant ball speed through the sand', () => {
    const points: PolarPoint[] = [[0, 0.5], [Math.PI / 2, 0.5]];
    const plan = planGcodeMotion(points, geometry, motion);
    const segment = plan.segments[0];
    expect(segment).toBeDefined();

    const deltaThetaDeg = Number(segment?.gcode.match(/X([-\d.]+)/)?.[1]);
    const deltaYMm = Number(segment?.gcode.match(/Y([-\d.]+)/)?.[1]);
    const feedPerMin = Number(segment?.gcode.match(/F([-\d.]+)/)?.[1]);

    const dsMm = polarSegmentLength([0, 0.5], [Math.PI / 2, 0.5]) * geometry.radiusMm;
    const expectedDtSeconds = Math.max(dsMm / motion.ballSpeedMmS, 90 / motion.maxThetaDegPerS);
    const expectedFeed = (Math.hypot(deltaThetaDeg, deltaYMm) / expectedDtSeconds) * 60;

    expect(feedPerMin).toBeCloseTo(expectedFeed, 1);
  });

  it('applies the arm/carriage coupling correction to Y', () => {
    const coupled = { ...geometry, couplingMmPerDeg: 0.1 };
    // Exactly motion.segmentMaxDeg (90°), so this is not subdivided into smaller steps.
    const points: PolarPoint[] = [[0, 0.2], [Math.PI / 2, 0.2]]; // 90 degrees, constant rho
    const plan = planGcodeMotion(points, coupled, motion);
    expect(plan.segments).toHaveLength(1);
    const deltaYMm = Number(plan.segments[0]?.gcode.match(/Y([-\d.]+)/)?.[1]);

    // The rho term is constant and cancels; only the coupling*thetaDeg term remains.
    expect(deltaYMm).toBeCloseTo(0.1 * 90, 3);
  });

  it('never commands rho past the configured margin', () => {
    const points: PolarPoint[] = [[0, 1], [0.1, 1]]; // both at (or past) the very edge
    const plan = planGcodeMotion(points, geometry, motion);

    // Both points clamp to the same rho (1 - rhoMargin): no radial component in Y.
    const deltaYMm = Number(plan.segments[0]?.gcode.match(/Y([-\d.]+)/)?.[1]);
    expect(deltaYMm).toBeCloseTo(0, 6);
  });

  it('caps the feed rate so theta never turns faster than maxThetaDegPerS, for a pure rotation', () => {
    // Ball speed (1000 mm/s) is deliberately huge so it cannot be the binding
    // constraint: only the theta-rate cap can explain the chosen feed.
    const slowRotation = { ballSpeedMmS: 1000, maxThetaDegPerS: 10, segmentMaxDeg: 90 };
    const points: PolarPoint[] = [[0, 0.1], [Math.PI / 3, 0.1]]; // 60 degrees, constant rho
    const plan = planGcodeMotion(points, geometry, slowRotation);
    const segment = plan.segments[0];
    expect(segment).toBeDefined();

    const deltaThetaDeg = Number(segment?.gcode.match(/X([-\d.]+)/)?.[1]);
    const deltaYMm = Number(segment?.gcode.match(/Y([-\d.]+)/)?.[1]);
    const feedPerMin = Number(segment?.gcode.match(/F([-\d.]+)/)?.[1]);
    const machineDistance = Math.hypot(deltaThetaDeg, deltaYMm);
    const timeSeconds = (machineDistance / feedPerMin) * 60;
    const thetaRateDegPerS = Math.abs(deltaThetaDeg) / timeSeconds;

    expect(thetaRateDegPerS).toBeCloseTo(slowRotation.maxThetaDegPerS, 3);
  });

  it('reports progress against the trajectory\'s own (unclamped) path length', () => {
    const points: PolarPoint[] = [[0, 0], [0, 1]]; // radial line, length 1 table-radius unit
    const plan = planGcodeMotion(points, geometry, motion);

    expect(plan.totalLength).toBeCloseTo(1, 6);
    expect(plan.segments.at(-1)?.cumulativeLength).toBeCloseTo(1, 6);
  });

  it('drops degenerate (zero-length) steps', () => {
    const points: PolarPoint[] = [[0, 0.5], [0, 0.5], [Math.PI / 2, 0.5]];
    const plan = planGcodeMotion(points, geometry, motion);

    expect(plan.segments).toHaveLength(1);
  });
});
