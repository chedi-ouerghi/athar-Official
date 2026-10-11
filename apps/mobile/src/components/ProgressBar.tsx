import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { radius } from '../theme';
import { useTheme } from './use-theme';

/** A slim gold bar filled to `progress` (0..1). It fills from the start side, so it mirrors in RTL. */
export function ProgressBar({ progress }: { readonly progress: number }): ReactElement {
  const theme = useTheme();
  const fraction = Math.min(1, Math.max(0, progress));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}
      style={[styles.track, { backgroundColor: theme.surfaceMuted }]}
    >
      <View style={[styles.fill, { backgroundColor: theme.gold, width: `${fraction * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
});
