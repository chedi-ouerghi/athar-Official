import { useState, type ReactElement, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { motion } from '../theme';
import { useReduceMotion } from './use-reduce-motion';

export interface PressableScaleProps extends Omit<PressableProps, 'style' | 'children'> {
  readonly children: ReactNode;
  /** Style of the surface that shrinks under the finger. */
  readonly style?: StyleProp<ViewStyle>;
  /** How small it gets while pressed. */
  readonly scaleTo?: number;
}

/**
 * A touchable that gives under the finger: a quick spring down on press and a
 * slightly bouncy return. The movement is on the native driver, so it stays smooth
 * while the screen is busy, and it is skipped when the user asked for less motion.
 */
export function PressableScale({
  children,
  style,
  scaleTo = 0.97,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps): ReactElement {
  const reduceMotion = useReduceMotion();
  const [scale] = useState(() => new Animated.Value(1));

  const springTo = (toValue: number) => {
    if (!reduceMotion) {
      Animated.spring(scale, { toValue, useNativeDriver: true, ...motion.pressSpring }).start();
    }
  };

  return (
    <Pressable
      {...rest}
      onPressIn={(event) => {
        springTo(scaleTo);
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        springTo(1);
        onPressOut?.(event);
      }}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}
