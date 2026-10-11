import { polarPathLength, type PolarPoint } from '@athar/contracts';
import { describe, expect, it } from 'vitest';
import { buildPreviewPaths, polarToXY, sampleCurve, toPathData } from './preview-geometry';

const TWO_PI = 2 * Math.PI;

/** Parse "M1 2L3 4" back into points. */
function parse(data: string): [number, number][] {
  return data
    .split(/(?=[ML])/)
    .filter(Boolean)
    .map((part) => {
      const [x, y] = part.slice(1).split(' ').map(Number);
      return [x ?? Number.NaN, y ?? Number.NaN];
    });
}

function length(points: readonly (readonly [number, number])[]): number {
  let total = 0;
  for (const [index, [x, y]] of points.entries()) {
    const previous = points[index - 1];
    if (previous) total += Math.hypot(x - previous[0], y - previous[1]);
  }
  return total;
}

describe('polarToXY', () => {
  it('puts angle 0 on the right and runs counter-clockwise on screen', () => {
    const [x0, y0] = polarToXY([0, 1]);
    const [x1, y1] = polarToXY([Math.PI / 2, 1]);

    expect(x0).toBeCloseTo(1, 12);
    expect(y0).toBeCloseTo(0, 12);
    expect(x1).toBeCloseTo(0, 12);
    expect(y1).toBeCloseTo(-1, 12); // up is negative y on screen
  });

  it('puts the centre at the origin whatever the angle', () => {
    expect(polarToXY([5, 0])[0]).toBeCloseTo(0, 12);
    expect(polarToXY([5, 0])[1]).toBeCloseTo(0, 12);
  });
});

describe('sampleCurve', () => {
  it('draws two points describing a full circle as a circle, not a chord', () => {
    const curve = sampleCurve([
      [0, 0.5],
      [TWO_PI, 0.5],
    ]);

    for (const [x, y] of curve) {
      expect(Math.hypot(x, y)).toBeCloseTo(0.5, 6);
    }
    expect(length(curve)).toBeCloseTo(Math.PI, 1);
  });

  it('keeps every original point', () => {
    const points: PolarPoint[] = [
      [0, 0],
      [1, 0.5],
      [2, 1],
    ];
    const curve = sampleCurve(points);

    for (const point of points) {
      const [x, y] = polarToXY(point);
      expect(curve.some(([cx, cy]) => Math.hypot(cx - x, cy - y) < 1e-9)).toBe(true);
    }
  });
});

describe('toPathData', () => {
  it('is empty for fewer than two points', () => {
    expect(toPathData([])).toBe('');
    expect(toPathData([[0, 0]])).toBe('');
  });

  it('writes a move then lines', () => {
    expect(
      toPathData([
        [0, 0],
        [1, 2],
      ]),
    ).toBe('M0.0000 0.0000L1.0000 2.0000');
  });
});

describe('buildPreviewPaths', () => {
  const path: PolarPoint[] = [
    [0, 0],
    [0, 1],
    [3, 1],
  ];

  it('draws nothing without progress, at zero, or for a bad value', () => {
    expect(buildPreviewPaths(path).drawn).toBe('');
    expect(buildPreviewPaths(path, 0).drawn).toBe('');
    expect(buildPreviewPaths(path, Number.NaN).drawn).toBe('');
    expect(buildPreviewPaths(path).full).not.toBe('');
  });

  it('draws the whole path at progress 1', () => {
    const { full, drawn } = buildPreviewPaths(path, 1);

    expect(length(parse(drawn))).toBeCloseTo(length(parse(full)), 6);
  });

  it('measures the drawn part by path length, not by point count', () => {
    // A radial line of length 1, then an arc of length 3: half the progress is
    // two units, which is the line plus one unit of the arc.
    const { drawn } = buildPreviewPaths(path, 0.5);

    expect(length(parse(drawn))).toBeCloseTo(polarPathLength(path) * 0.5, 1);
  });

  it('draws a strict prefix: every drawn point lies on the full path in order', () => {
    const { full, drawn } = buildPreviewPaths(path, 0.7);
    const fullPoints = parse(full);
    const drawnPoints = parse(drawn);

    expect(drawnPoints.length).toBeLessThan(fullPoints.length);
    expect(drawnPoints[0]).toStrictEqual(fullPoints[0]);
  });

  it('grows with progress and never exceeds the whole', () => {
    const lengths = [0.1, 0.4, 0.8, 1, 5].map((p) =>
      length(parse(buildPreviewPaths(path, p).drawn)),
    );

    for (const [i, value] of lengths.entries()) {
      expect(value).toBeGreaterThanOrEqual(lengths[i - 1] ?? 0);
    }
    expect(lengths.at(-1)).toBeCloseTo(lengths.at(-2) ?? 0, 6);
  });
});
