/**
 * Eight-point stars.
 *
 * Four eight-point stars nested one inside the next, each turned half a point
 * against its neighbour, drawn as clean star outlines (sixteen straight edges
 * alternating between a point and a notch). The proportions are chosen so that
 * every star's points land exactly in the notches of the star outside it, the
 * way the layers of a rosette interlock: the radius of a notch is `ratio` times
 * the radius of a point, and each star is `ratio` times the size of the next.
 *
 * That fit is what makes one unbroken path possible. The path runs out from the
 * centre to the innermost star, traces it, steps along one edge into the notch
 * it shares with the next star, traces that, and so on outward. It returns to
 * the centre along an axis of symmetry that passes through a point or notch of
 * every star, so the return looks intended.
 *
 * Eight-point stars are a familiar motif of Islamic geometric ornament. This is
 * an original arrangement, not a reproduction of any specific monument or
 * traditional pattern.
 */

import type { Trajectory } from '../../device/trajectory.js';
import { PolarPathBuilder, TWO_PI } from './path-builder.js';

export interface StarOptions {
  /** Radius of the outermost star's points, below 1. */
  readonly outerRadius?: number;
  /** How deep the notches are: notch radius over point radius, between 0 and 1. */
  readonly ratio?: number;
  /** Number of nested stars. */
  readonly stars?: number;
  /** Points on each star. */
  readonly points?: number;
}

export function generateStar(options: StarOptions = {}): Trajectory {
  const outerRadius = options.outerRadius ?? 0.92;
  const ratio = options.ratio ?? 0.7;
  const stars = options.stars ?? 4;
  const points = options.points ?? 8;

  if (!(ratio > 0 && ratio < 1) || stars < 1 || points < 3) {
    throw new RangeError('A star needs a ratio between 0 and 1, at least one star and 3 points.');
  }

  const halfStep = Math.PI / points;

  /** Radius of star `index`, counting from the innermost. */
  const radiusOf = (index: number): number => outerRadius * ratio ** (stars - 1 - index);

  /** Alternate stars are turned half a point; the outermost is not turned. */
  const turnOf = (index: number): number => ((stars - 1 - index) % 2 === 0 ? 0 : halfStep);

  /** Vertex `vertex` of star `index`: even vertices are points, odd ones are notches. */
  const vertexOf = (index: number, vertex: number): [number, number] => {
    const angle = turnOf(index) + halfStep * vertex;
    const radius = radiusOf(index) * (vertex % 2 === 0 ? 1 : ratio);

    return [radius * Math.cos(angle), radius * Math.sin(angle)];
  };

  const path = new PolarPathBuilder().polar(0, 0);

  // Out to the innermost star, along the line through one of its points.
  path.lineTo(...vertexOf(0, 0));
  let entry = 0;

  for (let index = 0; index < stars; index += 1) {
    // Round this star once, from the vertex we are standing on back to it.
    for (let step = 1; step <= 2 * points; step += 1) {
      path.lineTo(...vertexOf(index, (entry + step) % (2 * points)));
    }

    if (index === stars - 1) {
      break;
    }

    // Stand on a point of this star, which is a notch of the next one: the
    // innermost star is entered on a point already, the others on a notch, one
    // edge away from the nearest point.
    const point = entry % 2 === 0 ? entry : (entry + 1) % (2 * points);

    if (point !== entry) {
      path.lineTo(...vertexOf(index, point));
    }

    const angle = turnOf(index) + halfStep * point;
    entry = Math.round(((angle - turnOf(index + 1)) / halfStep + 2 * points) % (2 * points));
  }

  // Home along the axis we finished on.
  path.lineTo(0, 0);

  return path.build();
}

/** Radians in a full turn, re-exported for tests that reason about the angles. */
export const FULL_TURN = TWO_PI;
