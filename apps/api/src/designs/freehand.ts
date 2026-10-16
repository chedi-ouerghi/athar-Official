/**
 * The owner's freehand path (the drawing pen), turned into a trajectory.
 *
 * The app sends the points of a finger stroke, which can be far apart. They are
 * joined by straight lines, sampled as finely as a design's, so the path passes
 * the same trajectory checks as a catalogue design without relaxing any rule:
 *
 * - **Lead-in and return.** The ball rests at home (the centre, `HOME_RHO = 0`),
 *   so the path starts with a line from the centre to its first point and ends
 *   with a line back. A path that already ends at the centre gains nothing.
 * - **Through the centre.** Near the centre the angle swings fast, and the
 *   table's linear-in-polar interpolation would bow a line that passes close by.
 *   A line passing within {@link CENTRE_SNAP_RHO} of the centre is drawn through
 *   it instead (moving it by at most that much), turning on the spot there, which
 *   draws nothing.
 *
 * Pure: points in, trajectory out. Validation is the caller's.
 */

import type { PolarPoint, Trajectory } from '../device/trajectory.js';
import { polarToXY, type XY } from './geometry.js';
import { PolarPathBuilder, nearestAngle } from './generators/path-builder.js';

/** A line passing closer than this to the centre is drawn through it, in table radii. */
export const CENTRE_SNAP_RHO = 0.02;

/**
 * Longest freehand trajectory accepted, in table radii, lead-in and return
 * included: about 33 minutes at the nominal speed, longer than any design.
 */
export const FREEHAND_MAX_LENGTH = 120;

export function freehandTrajectory(path: readonly PolarPoint[]): Trajectory {
  // Relies on home being the centre: see the file comment.
  const builder = new PolarPathBuilder().polar(0, 0);

  for (const point of path) {
    lineTo(builder, polarToXY(point));
  }

  lineTo(builder, [0, 0]);

  return builder.build();
}

/** Distance from the centre to the nearest point of the segment `a`-`b`. */
function closestToCentre([ax, ay]: XY, [bx, by]: XY): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, -(ax * dx + ay * dy) / lengthSquared));

  return Math.hypot(ax + t * dx, ay + t * dy);
}

function lineTo(builder: PolarPathBuilder, [x, y]: XY): void {
  if (closestToCentre(polarToXY(builder.last), [x, y]) >= CENTRE_SNAP_RHO) {
    builder.lineTo(x, y);
    return;
  }

  builder.lineTo(0, 0);

  if (Math.hypot(x, y) > 0) {
    builder.polar(nearestAngle(Math.atan2(y, x), builder.last[0]), 0).lineTo(x, y);
  }
}
