import { useMemo, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import type { PreviewPath } from '@athar/contracts';
import { useI18n } from '../i18n/context';
import { PREVIEW_VIEW_BOX, buildPreviewPaths } from '../preview/preview-geometry';
import { shadows } from '../theme';
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
  /** Side of the square, in pixels. Defaults to filling the width. */
  readonly size?: number;
  readonly testID?: string;
}

/** Stroke widths, in table-radius units (the view is about 2.1 wide). */
const FAINT_WIDTH = 0.013;
const DRAWN_WIDTH = 0.022;
const EDGE_WIDTH = 0.012;
const RING_RADIUS = 1.04;
const RING_WIDTH = 0.02;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * A design on its sand disc: a softly lit round table, the whole path faintly, the
 * part drawn so far boldly, and optionally a gold arc around the rim for progress.
 * Never mirrored for right-to-left languages, because it depicts a physical
 * drawing, not a layout.
 */
export function DesignPreview({
  path,
  progress,
  ring = false,
  size,
  testID,
}: DesignPreviewProps): ReactElement {
  const { t, percent } = useI18n();
  const theme = useTheme();
  const paths = useMemo(() => buildPreviewPaths(path, progress), [path, progress]);
  const shown = Math.min(1, Math.max(0, progress ?? 0));

  const label =
    progress === undefined
      ? t('designPreview.label')
      : t('designPreview.labelWithProgress', { percent: percent(progress) });

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={[
        styles.frame,
        shadows.soft,
        { backgroundColor: theme.discEdge, shadowColor: theme.shadow },
        size === undefined ? styles.fluid : { width: size, height: size },
      ]}
      testID={testID}
    >
      <Svg width="100%" height="100%" viewBox={PREVIEW_VIEW_BOX}>
        <Defs>
          <RadialGradient id="disc" cx="0" cy="-0.15" r="1.1" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={theme.discCenter} />
            <Stop offset="1" stopColor={theme.discEdge} />
          </RadialGradient>
        </Defs>
        <Circle cx={0} cy={0} r={1.06} fill={theme.discEdge} />
        <Circle cx={0} cy={0} r={1} fill="url(#disc)" />
        <Circle cx={0} cy={0} r={1} fill="none" stroke={theme.gold} strokeWidth={EDGE_WIDTH} />
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
            <Circle
              cx={0}
              cy={0}
              r={RING_RADIUS}
              fill="none"
              stroke={theme.gold}
              strokeOpacity={0.22}
              strokeWidth={RING_WIDTH}
            />
            <Circle
              cx={0}
              cy={0}
              r={RING_RADIUS}
              fill="none"
              stroke={theme.gold}
              strokeWidth={RING_WIDTH}
              strokeLinecap="round"
              strokeDasharray={`${RING_LENGTH * shown} ${RING_LENGTH}`}
              rotation={-90}
              originX={0}
              originY={0}
              testID={testID ? `${testID}-ring` : undefined}
            />
          </>
        ) : null}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  // Fully round: the table is a disc, and the picture should look like one.
  frame: { borderRadius: 9999 },
  fluid: { width: '100%', aspectRatio: 1 },
});
