import { useEffect, useState, type ReactElement } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useI18n } from '../i18n/context';
import { spacing } from '../theme';
import { AppText } from './AppText';
import { Ornament } from './Ornament';
import { useReduceMotion } from './use-reduce-motion';

export interface LoadingStateProps {
  /** Replaces the default "Loading…" text. Already translated. */
  readonly message?: string;
  readonly testID?: string;
}

/** The sand-table spiral, slowly breathing, with a quiet line of text under it. */
export function LoadingState({ message, testID }: LoadingStateProps): ReactElement {
  const { t } = useI18n();
  const reduceMotion = useReduceMotion();
  const [breath] = useState(() => new Animated.Value(0));
  const text = message ?? t('common.loading');

  useEffect(() => {
    if (reduceMotion) {
      breath.setValue(0.5);
      return undefined;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();

    return () => {
      loop.stop();
    };
  }, [breath, reduceMotion]);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('state.loading')}
      accessibilityState={{ busy: true }}
      style={styles.container}
      testID={testID}
    >
      <Animated.View
        style={{
          opacity: breath.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }),
          transform: [
            { scale: breath.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.02] }) },
          ],
        }}
      >
        <Ornament size={96} strength={1} />
      </Animated.View>
      <AppText tone="textMuted">{text}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
});
