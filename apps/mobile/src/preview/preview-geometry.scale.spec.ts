import { tableProportions, type PolarPoint } from '@athar/contracts';
import { describe, expect, it } from 'vitest';
import {
  PREVIEW_MARGIN,
  buildPreviewPaths,
  polarToXY,
  previewViewBox,
  sampleCurve,
} from './preview-geometry';

/** A full turn at the edge of the table: its outline, whatever the table. */
const EDGE: PolarPoint[] = [
  [0, 1],
  [2 * Math.PI, 1],
];

function extent(points: readonly (readonly [number, number])[]) {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);

  return { width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

describe('a table that is not round', () => {
  const rectangle = tableProportions({ widthMm: 1200, heightMm: 800 });

  it('stretches a polar point to the table, as the controller does', () => {
    const [x0, y0] = polarToXY([0, 1], rectangle);
    const [x1, y1] = polarToXY([Math.PI / 2, 1], rectangle);

    expect(x0).toBeCloseTo(1);
    expect(y0).toBeCloseTo(0);
    expect(x1).toBeCloseTo(0);
    // Screen y runs down, so counter-clockwise on the table is up on the screen.
    expect(y1).toBeCloseTo(-2 / 3);
  });

  it('keeps a round or square table a disc: no stretching without a scale', () => {
    expect(polarToXY([0.7, 0.4])).toStrictEqual(polarToXY([0.7, 0.4], { x: 1, y: 1 }));
    expect(tableProportions({ widthMm: 700, heightMm: 700 })).toStrictEqual({ x: 1, y: 1 });
  });

  it('draws an outline as wide and as tall as the table is', () => {
    const { width, height } = extent(sampleCurve(EDGE, 0.02, rectangle));

    expect(width / height).toBeCloseTo(1200 / 800, 2);
    expect(width).toBeCloseTo(2, 2);
  });

  it('applies the scale to the part drawn so far as well as to the whole', () => {
    const { full, drawn } = buildPreviewPaths(EDGE, 1, rectangle);
    const pointsOf = (data: string) =>
      data
        .split(/(?=[ML])/)
        .filter(Boolean)
        .map((part) => part.slice(1).split(' ').map(Number) as [number, number]);

    expect(extent(pointsOf(full)).height).toBeCloseTo(4 / 3, 2);
    expect(extent(pointsOf(drawn)).height).toBeCloseTo(4 / 3, 2);
  });
});

describe('previewViewBox', () => {
  it('is square for a table with equal sides, with a margin all round', () => {
    const { viewBox, aspect } = previewViewBox({ x: 1, y: 1 });
    const half = 1 + PREVIEW_MARGIN;

    expect(aspect).toBe(1);
    expect(viewBox).toBe(`${-half} ${-half} ${2 * half} ${2 * half}`);
  });

  it('is wider than tall for a wide table and the other way round for a tall one', () => {
    expect(previewViewBox({ x: 1, y: 0.5 }).aspect).toBeGreaterThan(1);
    expect(previewViewBox({ x: 0.5, y: 1 }).aspect).toBeLessThan(1);
  });
});
