import { PREVIEW_PATH_MAX_POINTS, previewPathSchema, type PreviewPath } from '@athar/contracts';
import type { Trajectory } from '../device/trajectory.js';
import { polarToXY, simplifyIndices } from './geometry.js';

/** Finest tolerance tried, in table radii: about a thousandth of the radius. */
const FINEST_TOLERANCE = 1e-3 / 10;

/** Coarsest tolerance tried: a tenth of the radius. */
const COARSEST_TOLERANCE = 0.1;

/**
 * The picture of a design that the app receives: the trajectory simplified to at
 * most {@link PREVIEW_PATH_MAX_POINTS} points, in the same polar-theta-rho/v1
 * convention.
 *
 * It is **derived**, never typed in, so it cannot drift from the design it
 * previews. Every point is a point of the trajectory itself (nothing is invented
 * or moved), so theta stays unwrapped and the first and last points are always
 * kept.
 *
 * How the points are chosen matters. Spacing them evenly along the path, the
 * obvious choice, is wrong for a design built of straight strokes and sharp
 * turns: the corners fall between samples and are cut off (measured on the palm
 * fronds, the preview came out a fifth shorter than the design). Instead the path
 * is simplified with the Douglas-Peucker algorithm, which keeps the points that
 * matter (corners, the crests of ripples) and drops the ones a straight line
 * can stand in for. The tolerance is the **smallest that fits the budget**: the
 * preview is as faithful as 500 points allow, and a trajectory already short
 * enough is returned whole.
 *
 * It is still an approximation: between two kept points the preview is a
 * straight line, and no dropped point is further from it than the tolerance
 * found, which for the shipped designs is a few thousandths of the table radius.
 *
 * @throws if the result is not a valid preview path.
 */
export function derivePreviewPath(
  trajectory: Trajectory,
  maxPoints: number = PREVIEW_PATH_MAX_POINTS,
): PreviewPath {
  const { points } = trajectory;
  const vertices = points.map(polarToXY);

  if (points.length <= maxPoints) {
    return previewPathSchema.parse(points.map(([theta, rho]) => [theta, rho]));
  }

  // The count only ever falls as the tolerance grows, so search for the smallest
  // tolerance whose result fits.
  let fine = FINEST_TOLERANCE;
  let coarse = COARSEST_TOLERANCE;
  let best = simplifyIndices(vertices, coarse);

  for (let round = 0; round < 24; round += 1) {
    const middle = (fine + coarse) / 2;
    const kept = simplifyIndices(vertices, middle);

    if (kept.length <= maxPoints) {
      best = kept;
      coarse = middle;
    } else {
      fine = middle;
    }
  }

  return previewPathSchema.parse(
    best.map((index): [number, number] => {
      const point = points[index];

      if (point === undefined) {
        throw new RangeError(`No point at index ${index}.`);
      }

      // Points of a valid trajectory are inside 0..1 already; this guards rounding only.
      return [point[0], Math.min(1, Math.max(0, point[1]))];
    }),
  );
}
