import type { ReactElement, ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius, shadows, spacing } from '../theme';
import { GlowFill } from './GradientFill';
import { PressableScale } from './PressableScale';
import { useIsDark, useTheme } from './use-theme';

export type CardTone = 'plain' | 'elevated' | 'glow';

export interface CardProps {
  readonly children: ReactNode;
  /**
   * `plain` sits on the background, `elevated` is one step lighter (for a card on a
   * card, or the one that matters), `glow` adds a gold edge and a pool of warm light
   * for the single hero of a screen.
   */
  readonly tone?: CardTone;
  /** Makes the whole card a button that gives under the finger. */
  readonly onPress?: () => void;
  /** Padding inside, from the spacing scale. Zero for a card that fills itself. */
  readonly padding?: keyof typeof spacing | 0;
  readonly style?: StyleProp<ViewStyle>;
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

/**
 * The surface everything sits on. In the dark look it is flat and edged by a hairline,
 * like the website's panels; only the hero glows. In the light look a soft lift
 * stands in for the dark's depth.
 */
export function Card({
  children,
  tone = 'plain',
  onPress,
  padding = 'lg',
  style,
  accessibilityLabel,
  testID,
}: CardProps): ReactElement {
  const theme = useTheme();
  const dark = useIsDark();
  const lift =
    tone === 'glow'
      ? shadows.glow
      : dark
        ? undefined
        : tone === 'plain'
          ? shadows.soft
          : shadows.lifted;
  const surface: StyleProp<ViewStyle> = [
    styles.card,
    lift,
    {
      backgroundColor: tone === 'plain' ? theme.surface : theme.surfaceElevated,
      borderColor: tone === 'glow' ? theme.gold : theme.border,
      shadowColor: tone === 'glow' ? theme.glow : theme.shadow,
      padding: padding === 0 ? 0 : spacing[padding],
    },
    style,
  ];
  const light =
    tone === 'glow' ? (
      <View style={styles.glow}>
        <GlowFill color={theme.glow} opacity={dark ? 0.22 : 0.3} />
      </View>
    ) : null;

  if (onPress !== undefined) {
    return (
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        scaleTo={0.985}
        style={surface}
        testID={testID}
      >
        {light}
        {children}
      </PressableScale>
    );
  }

  return (
    <View style={surface} testID={testID} accessibilityLabel={accessibilityLabel}>
      {light}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  /** The warm light stays inside the card's rounded edge. */
  glow: {
    ...StyleSheet.absoluteFill,
    borderRadius: radius.lg,
    overflow: 'hidden',
    pointerEvents: 'none',
  },
});
