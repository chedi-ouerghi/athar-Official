import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';
import { motion } from '../theme';
import { useReduceMotion } from './use-reduce-motion';

export interface FadeInProps {
  readonly children: ReactNode;
  /** Wait before starting, in ms. Use a small step per item for a staggered entrance. */
  readonly delay?: number;
  readonly style?: StyleProp<ViewStyle>;
}

/** The delay of the nth item of a list entering one after another. */
export function staggerDelay(index: number, base = 0): number {
  return base + index * motion.stagger;
}

/**
 * Content that eases in: a fade, a rise and a slight settle from 96% size, once,
 * when it first appears. The movement is vertical only, so it reads the same in
 * both reading directions, and it is skipped when the user asked for less motion.
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
      duration: motion.slow,
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
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [motion.rise, 0],
              }),
            },
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
