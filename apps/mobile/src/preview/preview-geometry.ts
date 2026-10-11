/**
 * Geometry of a design preview: from a `previewPath` (polar points) to SVG path
 * data, and the split between the part drawn so far and the whole.
 *
 * Pure and free of React Native, so it is unit-tested in Node; the component only
 * renders what this returns.
 *
 * Orientation matches the API's own SVG renderer (`designs:svg`): the y axis is
 * flipped so angles run counter-clockwise, as on the table. The picture depicts a
 * physical drawing, so it is never mirrored for right-to-left languages.
 */

import { locateAlongPath, polarSegmentLength, type PolarPoint } from '@athar/contracts';

/** Table radius is 1; the view leaves a margin around the rim. */
export const PREVIEW_VIEW = 1.06;

/** `viewBox` of the preview: centred on the table. */
export const PREVIEW_VIEW_BOX = `${-PREVIEW_VIEW} ${-PREVIEW_VIEW} ${2 * PREVIEW_VIEW} ${2 * PREVIEW_VIEW}`;

/**
 * Largest gap between two sampled points, in table radii. Small enough that a
 * curve looks smooth at phone size, large enough to keep the path short.
 */
const MAX_STEP = 0.02;

export type XY = readonly [x: number, y: number];

export function polarToXY([theta, rho]: PolarPoint): XY {
  return [rho * Math.cos(theta), -rho * Math.sin(theta)];
}

/**
 * The curve a path draws, as Cartesian points. Between two points rho changes
 * linearly with theta, so each segment is sampled along that spiral rather than
 * joined by a straight chord: a long arc described by two points must look like
 * an arc, not a line.
 */
export function sampleCurve(points: readonly PolarPoint[], maxStep = MAX_STEP): XY[] {
  const sampled: XY[] = [];

  for (const [index, point] of points.entries()) {
    const previous = points[index - 1];

    if (previous === undefined) {
      sampled.push(polarToXY(point));
      continue;
    }

    const steps = Math.max(1, Math.ceil(polarSegmentLength(previous, point) / maxStep));

    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      sampled.push(
        polarToXY([
          previous[0] + (point[0] - previous[0]) * t,
          previous[1] + (point[1] - previous[1]) * t,
        ]),
      );
    }
  }

  return sampled;
}

/** SVG path data for a polyline, to four decimals. Empty when there is nothing to draw. */
export function toPathData(xy: readonly XY[]): string {
  if (xy.length < 2) {
    return '';
  }

  return xy
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(4)} ${y.toFixed(4)}`)
    .join('');
}

export interface PreviewPaths {
  /** The whole design. */
  readonly full: string;
  /** The part drawn so far; empty until something has been drawn. */
  readonly drawn: string;
}

/**
 * The paths to render.
 *
 * `progress` is the job's progress, 0..1. The drawn part is the prefix of the
 * path whose cumulative length is `progress` times the total, interpolating
 * inside the last segment: the same rule the driver uses for progress, applied
 * to the coarser preview. With no `progress` nothing is drawn.
 */
export function buildPreviewPaths(path: readonly PolarPoint[], progress?: number): PreviewPaths {
  const full = toPathData(sampleCurve(path));

  if (progress === undefined || !(progress > 0) || path.length < 2) {
    return { full, drawn: '' };
  }

  const { point, passed } = locateAlongPath(path, progress);

  return { full, drawn: toPathData(sampleCurve([...path.slice(0, passed), point])) };
}
