import { useMemo, type ReactElement } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { tableProportions, type PreviewPath, type TableGeometry } from '@athar/contracts';
import { useI18n } from '../i18n/context';
import { buildPreviewPaths, previewViewBox } from '../preview/preview-geometry';
import { radius, shadows } from '../theme';
import { useTheme } from './use-theme';

export interface DesignPreviewProps {
  /** `previewPath` of a design detail. */
  readonly path: PreviewPath;
  /**
   * `job.progress`, 0..1. When given, the part drawn so far is shown in the
   * stronger colour over the faint whole. It is exactly what the last poll
   * returned: nothing is extrapolated.
   */
  readonly progress?: number;
  /** Also trace the progress as a thin gold arc around the rim. */
  readonly ring?: boolean;
  /** Longer side of the picture, in pixels. Defaults to filling the width. */
  readonly size?: number;
  /** The table's shape and size, drawn to scale. A round table when left out. */
  readonly geometry?: Pick<TableGeometry, 'shape' | 'widthMm' | 'heightMm'>;
  readonly testID?: string;
}

const ROUND_TABLE = { shape: 'round', widthMm: 1, heightMm: 1 } as const;

/** Stroke widths, in table-radius units (the view is about 2.1 wide). */
const FAINT_WIDTH = 0.013;
const DRAWN_WIDTH = 0.022;
const EDGE_WIDTH = 0.012;
const RING_GAP = 0.04;
const RING_WIDTH = 0.02;
/** Corner radius of a square or rectangular table, in the same units. */
const CORNER = 0.09;

/** Ramanujan's approximation, exact enough for a dash array (error under 1e-4). */
function ellipsePerimeter(a: number, b: number): number {
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}

/**
 * A design on its table: a softly lit table of the right shape (round, square,
 * rectangular or oval, drawn to scale), the whole path faintly, the part drawn so
 * far boldly, and optionally a gold line around the rim for progress. The design
 * is stretched to the ellipse inscribed in the table, as the controller does it.
 * Never mirrored for right-to-left languages, because it depicts a physical
 * drawing, not a layout.
 */
export function DesignPreview({
  path,
  progress,
  ring = false,
  size,
  geometry = ROUND_TABLE,
  testID,
}: DesignPreviewProps): ReactElement {
  const { t, percent } = useI18n();
  const theme = useTheme();
  const scale = tableProportions(geometry);
  const { x: halfX, y: halfY } = scale;
  const paths = useMemo(
    () => buildPreviewPaths(path, progress, { x: halfX, y: halfY }),
    [path, progress, halfX, halfY],
  );
  const { viewBox, aspect } = previewViewBox(scale);
  const shown = Math.min(1, Math.max(0, progress ?? 0));
  const { shape } = geometry;

  const ringX = halfX + RING_GAP;
  const ringY = halfY + RING_GAP;
  // The ring runs along the table's own outline, a little outside it, from the top, clockwise.
  const boxy = shape === 'square' || shape === 'rectangle';
  const corner = CORNER + RING_GAP;
  const ringLength = boxy
    ? 4 * (ringX + ringY) - 8 * corner + 2 * Math.PI * corner
    : ellipsePerimeter(ringX, ringY);
  const ringPath = boxy
    ? `M0 ${-ringY}H${ringX - corner}A${corner} ${corner} 0 0 1 ${ringX} ${-ringY + corner}V${ringY - corner}A${corner} ${corner} 0 0 1 ${ringX - corner} ${ringY}H${-ringX + corner}A${corner} ${corner} 0 0 1 ${-ringX} ${ringY - corner}V${-ringY + corner}A${corner} ${corner} 0 0 1 ${-ringX + corner} ${-ringY}H0`
    : // Two half turns: an arc cannot be drawn in one piece.
      `M0 ${-ringY}A${ringX} ${ringY} 0 1 1 0 ${ringY}A${ringX} ${ringY} 0 1 1 0 ${-ringY}`;

  const label =
    progress === undefined
      ? t('designPreview.label')
      : t('designPreview.labelWithProgress', { percent: percent(progress) });

  // The frame is the table's rim: its outline has to follow the shape.
  const outline: ViewStyle = {
    borderRadius: shape === 'round' ? 9999 : shape === 'oval' ? '50%' : radius.lg,
  };
  const dimensions: ViewStyle =
    size === undefined
      ? { width: '100%', aspectRatio: aspect }
      : aspect >= 1
        ? { width: size, height: size / aspect }
        : { width: size * aspect, height: size };

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[
        styles.frame,
        shadows.soft,
        outline,
        dimensions,
        { backgroundColor: theme.discEdge, shadowColor: theme.shadow },
      ]}
      testID={testID}
    >
      <Svg width="100%" height="100%" viewBox={viewBox}>
        <Defs>
          <RadialGradient id="disc" cx="0" cy="-0.15" r="1.1" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={theme.discCenter} />
            <Stop offset="1" stopColor={theme.discEdge} />
          </RadialGradient>
        </Defs>
        {shape === 'round' ? (
          <>
            <Circle cx={0} cy={0} r={1} fill="url(#disc)" />
            <Circle cx={0} cy={0} r={1} fill="none" stroke={theme.gold} strokeWidth={EDGE_WIDTH} />
          </>
        ) : shape === 'oval' ? (
          <>
            <Ellipse cx={0} cy={0} rx={halfX} ry={halfY} fill="url(#disc)" />
            <Ellipse
              cx={0}
              cy={0}
              rx={halfX}
              ry={halfY}
              fill="none"
              stroke={theme.gold}
              strokeWidth={EDGE_WIDTH}
            />
          </>
        ) : (
          <>
            <Rect
              x={-halfX}
              y={-halfY}
              width={2 * halfX}
              height={2 * halfY}
              rx={CORNER}
              fill="url(#disc)"
            />
            <Rect
              x={-halfX}
              y={-halfY}
              width={2 * halfX}
              height={2 * halfY}
              rx={CORNER}
              fill="none"
              stroke={theme.gold}
              strokeWidth={EDGE_WIDTH}
            />
            {/* The corners are outside the ellipse designs are drawn in. */}
            <Ellipse
              cx={0}
              cy={0}
              rx={halfX}
              ry={halfY}
              fill="none"
              stroke={theme.gold}
              strokeOpacity={0.35}
              strokeWidth={EDGE_WIDTH}
              strokeDasharray="0.04 0.05"
            />
          </>
        )}
        <Path
          d={paths.full}
          fill="none"
          stroke={theme.pathFaint}
          strokeWidth={FAINT_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
          testID={testID ? `${testID}-full` : undefined}
        />
        {paths.drawn.length > 0 ? (
          <Path
            d={paths.drawn}
            fill="none"
            stroke={theme.pathDrawn}
            strokeWidth={DRAWN_WIDTH}
            strokeLinecap="round"
            strokeLinejoin="round"
            testID={testID ? `${testID}-drawn` : undefined}
          />
        ) : null}
        {ring ? (
          <>
            <Path
              d={ringPath}
              fill="none"
              stroke={theme.gold}
              strokeOpacity={0.22}
              strokeWidth={RING_WIDTH}
            />
            <Path
              d={ringPath}
              fill="none"
              stroke={theme.gold}
              strokeWidth={RING_WIDTH}
              strokeLinecap="round"
              strokeDasharray={`${ringLength * shown} ${ringLength}`}
              testID={testID ? `${testID}-ring` : undefined}
            />
          </>
        ) : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
});
