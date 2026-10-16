/**
 * The rake: smooths the sand before a new drawing.
 *
 * An Archimedean spiral winds outward from the centre to near the rim, its
 * lines one ball-track apart, so every part of the sand is passed over once.
 * Then the ball runs straight back to the centre, because every drawing starts
 * and ends at home (`home.ts`, `HOME_RHO = 0`). That return leaves one radial
 * line; if home moves to the rim, the return disappears and this generator
 * gets simpler.
 *
 * It is not a design: it is not in the catalogue, but it passes the same
 * trajectory checks as one.
 */

import type { Trajectory } from '../../device/trajectory.js';
import { HOME_RHO } from '../home.js';
import { PolarPathBuilder, TWO_PI } from './path-builder.js';

export interface RakeOptions {
  /** Turns of the spiral. With `rimRho`, sets the gap between lines. */
  readonly revolutions?: number;
  /** Radius of the outermost turn, below 1 to keep off the rim. */
  readonly rimRho?: number;
  /** Samples per turn. */
  readonly samplesPerRevolution?: number;
}

export function generateRake(options: RakeOptions = {}): Trajectory {
  // 20 turns to 0.96: lines 0.048 radii apart. A placeholder until the ball size
  // is known: the real pitch is the width of the ball's track.
  const revolutions = options.revolutions ?? 20;
  const rimRho = options.rimRho ?? 0.96;
  const samples = options.samplesPerRevolution ?? 256;
  const turns = TWO_PI * revolutions;

  return new PolarPathBuilder()
    .polar(0, HOME_RHO)
    .curve(turns, (theta) => (rimRho * theta) / turns, TWO_PI / samples)
    .radialTo(HOME_RHO)
    .build();
}
