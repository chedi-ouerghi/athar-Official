/**
 * Desert dunes.
 *
 * Two arms of one spiral, drawn out and back: the first winds outward from the
 * centre, a half turn along the rim joins it to the second, and the second winds
 * back to the centre between the lines of the first. The two arms are one
 * pitch apart, so they interleave like the ridges of a dune field and never
 * cross.
 *
 * What makes it read as dunes rather than as a plain spiral:
 * - every line carries **ripples**, wind-ripple waves that are *asymmetric*, with
 *   a gentle windward slope and a steeper lee, as real ripples are;
 * - the ripples grow with distance from the centre, as dune crests do;
 * - the whole spiral drifts off-centre toward one side, so the lines crowd on
 *   the windward side and open out on the lee, like the contour lines of a
 *   single large dune.
 *
 * It starts and ends at the centre.
 */

import type { Trajectory } from '../../device/trajectory.js';
import { PolarPathBuilder, TWO_PI, smoothstep } from './path-builder.js';

export interface DunesOptions {
  /** Turns of each arm. */
  readonly revolutions?: number;
  /** Radius of the outermost line before ripples and drift, below 1. */
  readonly rimRho?: number;
  /** Ripple waves per turn. */
  readonly ripplesPerRevolution?: number;
  /** Ripple height as a fraction of half the distance between the two arms. */
  readonly rippleFraction?: number;
  /** How far the spiral drifts off-centre, as a fraction of radius. */
  readonly drift?: number;
  /** Direction of the drift, in radians. */
  readonly driftAngle?: number;
  /** Samples per turn. */
  readonly samplesPerRevolution?: number;
}

/** Phase of the ripples on the outward arm and on the return arm. */
const OUT_PHASE = 0;
const BACK_PHASE = 2.1;

/** One asymmetric ripple: a sine with a second harmonic, roughly within -1..1. */
function ripple(phase: number): number {
  return (Math.sin(phase) + 0.28 * Math.sin(2 * phase + 0.9)) / 1.2;
}

export function generateDunes(options: DunesOptions = {}): Trajectory {
  const revolutions = options.revolutions ?? 8;
  const rimRho = options.rimRho ?? 0.92;
  const ripples = options.ripplesPerRevolution ?? 9;
  const rippleFraction = options.rippleFraction ?? 0.35;
  const drift = options.drift ?? 0.04;
  const driftAngle = options.driftAngle ?? Math.PI / 6;
  const samples = options.samplesPerRevolution ?? 260;

  const turns = TWO_PI * revolutions;
  const pitch = rimRho / revolutions;
  const halfGap = pitch / 2;
  const stepTheta = TWO_PI / samples;

  /** Radius of the line at `baseRho`, once drift and ripples are applied. */
  const radius = (baseRho: number, theta: number, phase: number): number => {
    const drifted = baseRho * (1 + drift * (baseRho / rimRho) * Math.cos(theta - driftAngle));
    const height = rippleFraction * halfGap * smoothstep(baseRho, 0, 0.25);

    return drifted + height * ripple(ripples * theta + phase);
  };

  const path = new PolarPathBuilder().polar(0, 0);

  // Out: winding outward, one pitch per turn.
  path.curve(turns, (theta) => radius((rimRho * theta) / turns, theta, OUT_PHASE), stepTheta);

  // Across: half a turn along the rim, the ripple phase easing from one arm to the other.
  path.curve(
    turns + Math.PI,
    (theta) => {
      const along = smoothstep((theta - turns) / Math.PI);
      return radius(rimRho, theta, OUT_PHASE + (BACK_PHASE - OUT_PHASE) * along);
    },
    stepTheta,
  );

  // Back: the same spiral turned half a turn, wound the other way, down to the centre.
  path.curve(
    Math.PI,
    (theta) => radius((rimRho * (theta - Math.PI)) / turns, theta, BACK_PHASE),
    stepTheta,
  );

  return path.build();
}
