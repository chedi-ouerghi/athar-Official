import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';
import { useReduceMotion } from './use-reduce-motion';

export interface FadeInProps {
  readonly children: ReactNode;
  /** Wait before starting, in ms. Use a small step per item for a staggered entrance. */
  readonly delay?: number;
  readonly style?: StyleProp<ViewStyle>;
}

const DURATION_MS = 520;
const RISE_PX = 14;

/**
 * Content that eases in: a short fade and rise, once, when it first appears. The
 * movement is vertical only, so it reads the same in both reading directions.
 */
export function FadeIn({ children, delay = 0, style }: FadeInProps): ReactElement {
  const reduceMotion = useReduceMotion();
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion) {
      progress.setValue(1);
      return undefined;
    }

    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: DURATION_MS,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();

    return () => {
      animation.stop();
    };
  }, [delay, progress, reduceMotion]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [RISE_PX, 0] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
