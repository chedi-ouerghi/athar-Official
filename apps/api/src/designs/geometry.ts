/**
 * Plain geometry for polar-theta-rho/v1 paths: conversion to Cartesian
 * coordinates, faithful sampling of the curve a trajectory describes, and the
 * measurements the design checks and the SVG renderer share.
 */

import { polarSegmentLength, type PolarPoint } from '../device/trajectory.js';

export type XY = readonly [x: number, y: number];

export function polarToXY([theta, rho]: PolarPoint): XY {
  return [rho * Math.cos(theta), rho * Math.sin(theta)];
}

export function distance([ax, ay]: XY, [bx, by]: XY): number {
  return Math.hypot(bx - ax, by - ay);
}

/**
 * The curve a trajectory draws, as Cartesian points no further apart than
 * `maxStep`. Between two trajectory points rho changes linearly with theta, so
 * each segment is sampled along that spiral, not along the straight chord:
 * what comes out is the shape the table would actually draw.
 */
export function sampleCurve(points: readonly PolarPoint[], maxStep = 0.01): XY[] {
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

/** Length of a Cartesian polyline. */
export function polylineLength(points: readonly XY[]): number {
  let total = 0;

  for (const [index, point] of points.entries()) {
    const previous = points[index - 1];

    if (previous !== undefined) {
      total += distance(previous, point);
    }
  }

  return total;
}

/** Distance from a point to the nearest point of a polyline's vertices. */
export function distanceToPolyline(point: XY, polyline: readonly XY[]): number {
  let nearest = Infinity;

  for (const vertex of polyline) {
    nearest = Math.min(nearest, distance(point, vertex));
  }

  return nearest;
}

/** The largest straight-line distance between two consecutive points. */
export function largestStep(points: readonly PolarPoint[]): number {
  let largest = 0;

  for (const [index, point] of points.entries()) {
    const previous = points[index - 1];

    if (previous !== undefined) {
      largest = Math.max(largest, distance(polarToXY(previous), polarToXY(point)));
    }
  }

  return largest;
}

/** Distance from a point to the straight segment between `a` and `b`. */
export function distanceToSegment(point: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return distance(point, a);
  }

  const t = Math.min(
    1,
    Math.max(0, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared),
  );

  return distance(point, [a[0] + t * dx, a[1] + t * dy]);
}

/**
 * The indices of the vertices of a polyline that remain after simplifying it
 * with the Douglas-Peucker algorithm: every dropped vertex lies within
 * `tolerance` of the simplified line. The first and last vertex always remain.
 *
 * Iterative rather than recursive, because a design has thousands of vertices.
 */
export function simplifyIndices(vertices: readonly XY[], tolerance: number): number[] {
  const last = vertices.length - 1;

  if (last < 1) {
    return vertices.map((_, index) => index);
  }

  const keep = new Set<number>([0, last]);
  const pending: [number, number][] = [[0, last]];

  for (let range = pending.pop(); range !== undefined; range = pending.pop()) {
    const [from, to] = range;
    const a = vertices[from];
    const b = vertices[to];
    let farthest = -1;
    let farthestDistance = tolerance;

    if (a === undefined || b === undefined) {
      continue;
    }

    for (let index = from + 1; index < to; index += 1) {
      const vertex = vertices[index];
      const away = vertex === undefined ? 0 : distanceToSegment(vertex, a, b);

      if (away > farthestDistance) {
        farthest = index;
        farthestDistance = away;
      }
    }

    if (farthest >= 0) {
      keep.add(farthest);
      pending.push([from, farthest], [farthest, to]);
    }
  }

  return [...keep].sort((x, y) => x - y);
}
