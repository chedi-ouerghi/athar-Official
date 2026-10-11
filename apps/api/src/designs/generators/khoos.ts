/**
 * Palm fronds.
 *
 * Eight date-palm fronds radiate from the centre. Each is drawn as a rib out to
 * the tip, then back down it with a leaflet on one side, then the other,
 * alternating, each leaflet a slim point that sweeps forward toward the tip and
 * returns to the rib. The leaflets are longest in the middle of the frond and
 * shrink toward both ends, like a real frond, and the herringbone they make
 * echoes the plaiting that khoos (palm-frond weaving) is built on.
 *
 * Every frond starts and ends at the centre, so the path is eight identical
 * out-and-back strokes, each turned an eighth of a turn from the last.
 *
 * This is an original interpretation of palm fronds and plaiting. It does not
 * reproduce any particular traditional khoos pattern.
 */

import type { Trajectory } from '../../device/trajectory.js';
import { PolarPathBuilder, TWO_PI } from './path-builder.js';

export interface KhoosOptions {
  /** Number of fronds. */
  readonly fronds?: number;
  /** Length of the rib, from the centre, below 1. */
  readonly length?: number;
  /** How far a leaflet reaches out from the rib, at the widest. */
  readonly halfWidth?: number;
  /** Leaflets down each frond, alternating sides. */
  readonly leaflets?: number;
  /** Where the leaflets stop, near the centre, so the middle stays open. */
  readonly innerRadius?: number;
  /** How far a leaflet's tip sweeps forward, as a multiple of the spacing along the rib. */
  readonly sweep?: number;
}

/**
 * A leaflet may reach out no further than this fraction of its distance from the
 * centre. Near the centre the fronds are close together, and without this
 * limit the leaflets of neighbouring fronds would touch.
 */
const MAX_REACH_PER_DISTANCE = 0.27;

export function generateKhoos(options: KhoosOptions = {}): Trajectory {
  const fronds = options.fronds ?? 8;
  const length = options.length ?? 0.93;
  const halfWidth = options.halfWidth ?? 0.12;
  const leaflets = options.leaflets ?? 16;
  const innerRadius = options.innerRadius ?? 0.16;
  const sweep = options.sweep ?? 1.7;

  // Leaflets are spaced evenly along the rib between the tip and the inner radius.
  const pitch = (length - 0.05 - innerRadius) / leaflets;

  /** A frond's reach at a given distance along it: nothing at either end. */
  const reach = (along: number): number =>
    Math.min(
      halfWidth * Math.sin(Math.PI * Math.min(1, Math.max(0, along / length)) ** 0.85),
      MAX_REACH_PER_DISTANCE * along,
    );

  const path = new PolarPathBuilder();

  for (let frond = 0; frond < fronds; frond += 1) {
    const axis = (TWO_PI * frond) / fronds;
    const cos = Math.cos(axis);
    const sin = Math.sin(axis);

    /** A point `along` the frond and `across` it, on the table. */
    const at = (along: number, across: number): [number, number] => [
      along * cos - across * sin,
      along * sin + across * cos,
    ];

    // Arrive at this frond's axis; at the centre the angle costs nothing to turn.
    path.polar(axis, 0);

    // The rib, out to the tip.
    path.lineTo(...at(length, 0));

    // Back down the rib, a leaflet on one side, then the other.
    for (let leaflet = 0; leaflet < leaflets; leaflet += 1) {
      const base = length - 0.05 - leaflet * pitch;
      const side = leaflet % 2 === 0 ? 1 : -1;
      const tipAlong = Math.min(length, base + sweep * pitch);

      path.lineTo(...at(base, 0));
      path.lineTo(...at(tipAlong, side * reach(tipAlong)));
      path.lineTo(...at(base - pitch, 0));
    }

    path.lineTo(0, 0);
  }

  return path.build();
}
