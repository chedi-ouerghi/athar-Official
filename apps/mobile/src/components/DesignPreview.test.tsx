import { describe, expect, it } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import type { PreviewPath } from '@athar/contracts';
import { renderWithI18n } from '../test-utils';
import { DesignPreview } from './DesignPreview';

// A radial line of length 1, then an arc of length 3.
const PATH: PreviewPath = [
  [0, 0],
  [0, 1],
  [3, 1],
];

/** The path data of a rendered element. */
function pathData(testID: string): string {
  return String(screen.getByTestId(testID).props.d);
}

/** Length of an "M x y L x y ..." polyline. */
function polylineLength(data: string): number {
  const points = data
    .split(/(?=[ML])/)
    .filter(Boolean)
    .map((part) => part.slice(1).split(' ').map(Number) as [number, number]);

  return points.reduce((sum, [x, y], index) => {
    const previous = points[index - 1];
    return previous ? sum + Math.hypot(x - previous[0], y - previous[1]) : sum;
  }, 0);
}

/** The two numbers of an SVG dash array: how much is drawn, and the whole length. */
function dashes(testID: string): number[] {
  return (screen.getByTestId(testID).props.strokeDasharray as string[]).map(Number);
}

describe('DesignPreview', () => {
  it('draws the whole design and nothing as drawn when there is no progress', () => {
    renderWithI18n(<DesignPreview path={PATH} testID="p" />);

    expect(pathData('p-full').startsWith('M')).toBe(true);
    expect(screen.queryByTestId('p-drawn')).toBeNull();
  });

  it('draws nothing as drawn at progress 0', () => {
    renderWithI18n(<DesignPreview path={PATH} progress={0} testID="p" />);

    expect(screen.queryByTestId('p-drawn')).toBeNull();
  });

  it('draws a part, measured by path length, in a separate stronger stroke', () => {
    renderWithI18n(<DesignPreview path={PATH} progress={0.5} testID="p" />);

    const full = polylineLength(pathData('p-full'));
    const drawn = polylineLength(pathData('p-drawn'));

    // Half of the progress is half of the length (two units: the line and one of
    // the arc), however few points describe it.
    expect(drawn / full).toBeGreaterThan(0.45);
    expect(drawn / full).toBeLessThan(0.55);
    expect(screen.getByTestId('p-drawn').props.stroke).not.toBe(
      screen.getByTestId('p-full').props.stroke,
    );
  });

  it('draws all of it at progress 1', () => {
    renderWithI18n(<DesignPreview path={PATH} progress={1} testID="p" />);

    expect(polylineLength(pathData('p-drawn'))).toBeCloseTo(polylineLength(pathData('p-full')), 3);
  });

  it('does not draw more than the whole for a progress above 1', () => {
    renderWithI18n(<DesignPreview path={PATH} progress={4} testID="p" />);

    expect(polylineLength(pathData('p-drawn'))).toBeCloseTo(polylineLength(pathData('p-full')), 3);
  });

  it('describes itself, with the progress, in the selected language', () => {
    renderWithI18n(<DesignPreview path={PATH} progress={0.4} testID="p" />);
    expect(screen.getByTestId('p').props.accessibilityLabel).toBe('Design preview, 40% drawn');
  });

  it('has a plain label without progress', () => {
    renderWithI18n(<DesignPreview path={PATH} testID="p" />);
    expect(screen.getByTestId('p').props.accessibilityLabel).toBe('Design preview');
  });

  it('uses the Arabic label for Arabic', () => {
    renderWithI18n(<DesignPreview path={PATH} testID="p" />, { locale: 'ar' });
    expect(screen.getByTestId('p').props.accessibilityLabel).toBe('معاينة التصميم');
  });

  describe('progress ring', () => {
    const CIRCUMFERENCE = 2 * Math.PI * 1.04;

    it('is absent unless asked for', () => {
      renderWithI18n(<DesignPreview path={PATH} progress={0.5} testID="p" />);

      expect(screen.queryByTestId('p-ring')).toBeNull();
    });

    it('traces exactly the progress around the rim', () => {
      renderWithI18n(<DesignPreview path={PATH} progress={0.25} ring testID="p" />);

      const [drawn, total] = dashes('p-ring');

      expect(total).toBeCloseTo(CIRCUMFERENCE, 3);
      expect((drawn ?? 0) / (total ?? 1)).toBeCloseTo(0.25, 3);
    });

    it('is empty at zero, full at one, and never beyond', () => {
      const fraction = (progress: number): number => {
        renderWithI18n(<DesignPreview path={PATH} progress={progress} ring testID="r" />);
        const [drawn, total] = dashes('r-ring');
        screen.unmount();

        return (drawn ?? 0) / (total ?? 1);
      };

      expect(fraction(0)).toBe(0);
      expect(fraction(1)).toBeCloseTo(1, 6);
      expect(fraction(3)).toBeCloseTo(1, 6);
    });
  });
});
