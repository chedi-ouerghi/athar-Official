import { useEffect, useState, type ReactElement } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { radius } from '../theme';
import { GradientFill } from './GradientFill';
import { useReduceMotion } from './use-reduce-motion';
import { useTheme } from './use-theme';

/**
 * A slim bar filled with the gold gradient up to `progress` (0..1). It fills from
 * the start side, so it mirrors in right-to-left layouts, and it glides to each new
 * value instead of jumping.
 */
export function ProgressBar({ progress }: { readonly progress: number }): ReactElement {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const fraction = Math.min(1, Math.max(0, progress));
  const [shown] = useState(() => new Animated.Value(fraction));

  useEffect(() => {
    if (reduceMotion) {
      shown.setValue(fraction);
      return;
    }

    // A width cannot run on the native driver; the bar is one small view.
    Animated.timing(shown, {
      toValue: fraction,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [fraction, reduceMotion, shown]);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
      style={[styles.track, { backgroundColor: theme.surfaceMuted }]}
    >
      <Animated.View
        style={[
          styles.fill,
          { width: shown.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
        ]}
      >
        <GradientFill
          from={theme.gradientStart}
          via={theme.gradientMid}
          to={theme.gradientEnd}
          direction="horizontal"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill, overflow: 'hidden' },
});
