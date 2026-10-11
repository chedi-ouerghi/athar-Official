/**
 * Al Sadu: bands of diamonds.
 *
 * Al Sadu is woven in narrow bands of geometric patterns, so this is drawn in
 * concentric bands too. Plain rings alternate with **diamond rows**. A row is
 * two full turns, each a zigzag around the same radius and exactly out of step
 * with the other, so the two lines cross every half tooth and the space between
 * them is a chain of diamonds. The rows have 6, 12 and 18 teeth: the same
 * diamond width at every radius, since a ring three times as wide holds three
 * times as many.
 *
 * Rings are joined by short radial steps that all lie on one line, like the seam
 * of a woven strip; the path returns to the centre along that same line, so the
 * seam is drawn over, not added to. It starts and ends at the centre.
 *
 * This is a stylised interpretation of geometric weaving, not a copy of any
 * particular traditional pattern.
 */

import type { Trajectory } from '../../device/trajectory.js';
import { PolarPathBuilder, TWO_PI, triangleWave } from './path-builder.js';

export interface SaduOptions {
  /** Radii of the plain rings, from the centre outward. */
  readonly plainRings?: readonly number[];
  /** Radius and tooth count of each diamond row, from the centre outward. */
  readonly rows?: readonly { readonly rho: number; readonly teeth: number }[];
  /** Height of a tooth: how far a zigzag strays from its row's radius. */
  readonly amplitude?: number;
  /** Samples per tooth. */
  readonly samplesPerTooth?: number;
}

const DEFAULT_RINGS = [0.1, 0.38, 0.66, 0.93] as const;
const DEFAULT_ROWS = [
  { rho: 0.24, teeth: 6 },
  { rho: 0.52, teeth: 12 },
  { rho: 0.8, teeth: 18 },
] as const;

export function generateSadu(options: SaduOptions = {}): Trajectory {
  const rings = [...(options.plainRings ?? DEFAULT_RINGS)];
  const rows = [...(options.rows ?? DEFAULT_ROWS)];
  const amplitude = options.amplitude ?? 0.06;
  const samplesPerTooth = options.samplesPerTooth ?? 16;

  // Bands in order of radius: each is a plain ring or a diamond row.
  const bands = [
    ...rings.map((rho) => ({ rho, teeth: 0 })),
    ...rows.map(({ rho, teeth }) => ({ rho, teeth })),
  ].sort((a, b) => a.rho - b.rho);

  const path = new PolarPathBuilder().polar(0, 0);
  let turns = 0;

  for (const { rho, teeth } of bands) {
    path.radialTo(rho);

    if (teeth === 0) {
      path.curve(TWO_PI * (turns + 1), () => rho, TWO_PI / 120);
      turns += 1;
      continue;
    }

    const step = TWO_PI / (teeth * samplesPerTooth);

    // First turn, then the same zigzag exactly half a tooth out of step.
    path.curve(
      TWO_PI * (turns + 1),
      (theta) => rho + amplitude * triangleWave(teeth * theta),
      step,
    );
    path.curve(
      TWO_PI * (turns + 2),
      (theta) => rho - amplitude * triangleWave(teeth * theta),
      step,
    );
    turns += 2;
  }

  // Back along the seam to the centre.
  path.radialTo(0);

  return path.build();
}
