import { describe, expect, it } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import type { PreviewPath, TableGeometry } from '@athar/contracts';
import { renderWithI18n } from '../test-utils';
import { DesignPreview } from './DesignPreview';

/** A full turn at the edge of the table. */
const OUTLINE: PreviewPath = [
  [0, 1],
  [2 * Math.PI, 1],
];

const SHAPES: Record<TableGeometry['shape'], TableGeometry> = {
  round: { shape: 'round', widthMm: 800, heightMm: 800 },
  square: { shape: 'square', widthMm: 700, heightMm: 700 },
  rectangle: { shape: 'rectangle', widthMm: 1200, heightMm: 800 },
  oval: { shape: 'oval', widthMm: 1500, heightMm: 900 },
};

/** The numbers of an "M x y L x y ..." polyline, split into xs and ys. */
function coordinates(testID: string) {
  const points = String(screen.getByTestId(testID).props.d)
    .split(/(?=[ML])/)
    .filter(Boolean)
    .map((part) => part.slice(1).split(' ').map(Number) as [number, number]);

  return { xs: points.map(([x]) => x), ys: points.map(([, y]) => y) };
}

const span = (values: number[]) => Math.max(...values) - Math.min(...values);

describe('DesignPreview on a table of each shape', () => {
  it.each(Object.keys(SHAPES) as (keyof typeof SHAPES)[])('draws on a %s table', (shape) => {
    renderWithI18n(
      <DesignPreview path={OUTLINE} progress={0.5} ring geometry={SHAPES[shape]} testID="p" />,
    );

    expect(String(screen.getByTestId('p-full').props.d).startsWith('M')).toBe(true);
    expect(String(screen.getByTestId('p-drawn').props.d).startsWith('M')).toBe(true);
    expect(screen.getByTestId('p-ring')).toBeTruthy();
  });

  it('draws a rectangular table to scale: as wide and as tall as the table is', () => {
    renderWithI18n(<DesignPreview path={OUTLINE} geometry={SHAPES.rectangle} testID="p" />);

    const { xs, ys } = coordinates('p-full');

    expect(span(xs) / span(ys)).toBeCloseTo(1200 / 800, 2);
  });

  it('draws a round table, a square one and a missing geometry the same, as a disc', () => {
    for (const [index, geometry] of [SHAPES.round, SHAPES.square, undefined].entries()) {
      renderWithI18n(<DesignPreview path={OUTLINE} geometry={geometry} testID={`q${index}`} />);

      const { xs, ys } = coordinates(`q${index}-full`);

      expect(span(xs)).toBeCloseTo(span(ys), 3);
    }
  });

  it('gives the picture the proportions of the table', () => {
    renderWithI18n(<DesignPreview path={OUTLINE} geometry={SHAPES.oval} size={200} testID="p" />);

    const style = [screen.getByTestId('p').props.style].flat(3).reduce(
      (merged: Record<string, unknown>, part: unknown) => ({
        ...merged,
        ...(part as Record<string, unknown>),
      }),
      {},
    );

    expect(Number(style.width)).toBe(200);
    expect(Number(style.height)).toBeLessThan(200);
  });

  it.each(['oval', 'rectangle', 'square', 'round'] as const)(
    'traces the progress ring along the outline of a %s table, without rotating it',
    (shape) => {
      renderWithI18n(
        <DesignPreview path={OUTLINE} progress={0.25} ring geometry={SHAPES[shape]} testID="p" />,
      );

      const ring = screen.getByTestId('p-ring');
      const [drawn, whole] = (ring.props.strokeDasharray as string[]).map(Number);

      // `rotation` and `originX` are what the web build rejects as invalid DOM properties.
      expect(ring.props.rotation).toBeUndefined();
      expect(ring.props.originX).toBeUndefined();
      expect((drawn ?? 0) / (whole ?? 1)).toBeCloseTo(0.25, 5);
    },
  );

  it('measures the ring of a rectangular table along its straight sides and corners', () => {
    renderWithI18n(
      <DesignPreview path={OUTLINE} progress={1} ring geometry={SHAPES.rectangle} testID="p" />,
    );

    const [, whole] = (screen.getByTestId('p-ring').props.strokeDasharray as string[]).map(Number);

    // 1200 x 800 mm: halves of 1 and 2/3 plus the gap, with corners of radius 0.13.
    const x = 1 + 0.04;
    const y = 2 / 3 + 0.04;
    const corner = 0.09 + 0.04;

    expect(whole).toBeCloseTo(4 * (x + y) - 8 * corner + 2 * Math.PI * corner, 4);
  });

  it('describes itself the same way whatever the shape', () => {
    renderWithI18n(
      <DesignPreview path={OUTLINE} progress={0.4} geometry={SHAPES.rectangle} testID="p" />,
    );

    expect(screen.getByTestId('p').props.accessibilityLabel).toBe('Design preview, 40% drawn');
  });
});
