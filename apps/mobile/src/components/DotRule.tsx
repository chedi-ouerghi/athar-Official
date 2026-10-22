import { useEffect, useState, type ReactElement } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useReduceMotion } from './use-reduce-motion';
import { useTheme } from './use-theme';

const DOT = 7;

/**
 * A hairline with a gold dot that drifts along it, slowly: the line the website
 * draws under its header, and the trace of the sand table's ball. It is a signature,
 * not a control, so it is hidden from screen readers and still when motion is reduced.
 */
export function DotRule(): ReactElement {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const [width, setWidth] = useState(0);
  const [drift] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion) {
      return undefined;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 7000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 7000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();

    return () => {
      loop.stop();
    };
  }, [drift, reduceMotion]);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
      }}
      style={styles.track}
    >
      <View style={[styles.line, { backgroundColor: theme.border }]} />
      <Animated.View
        style={[
          styles.dot,
          {
            backgroundColor: theme.gold,
            shadowColor: theme.glow,
            transform: [
              {
                translateX: drift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, Math.max(0, width - DOT)],
                }),
              },
            ],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: DOT, justifyContent: 'center' },
  line: { height: StyleSheet.hairlineWidth },
  dot: {
    position: 'absolute',
    top: 0,
    start: 0,
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
});
