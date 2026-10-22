import { useEffect, useState, type ReactElement } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useReduceMotion } from './use-reduce-motion';
import { useTheme } from './use-theme';

export type MarkTone = 'success' | 'danger' | 'neutral';

export interface SuccessMarkProps {
  readonly tone?: MarkTone;
  readonly size?: number;
  readonly testID?: string;
}

/** The glyph for each outcome, on a 120 grid, and the length its stroke is drawn over. */
const GLYPH: Readonly<Record<MarkTone, { readonly d: string; readonly length: number }>> = {
  success: { d: 'M38 62l15 15 30-34', length: 90 },
  danger: { d: 'M60 36v30M60 82v.5', length: 60 },
  neutral: { d: 'M44 44h32v32H44z', length: 140 },
};

/**
 * How a drawing ended, as one shape: a disc that pops in, then its glyph drawn
 * stroke by stroke. Without motion it simply appears finished.
 *
 * The stroke is drawn by moving its dash offset from the animated value's listener,
 * not by an animated SVG component: that works the same on the phone and on the web.
 */
export function SuccessMark({
  tone = 'success',
  size = 132,
  testID,
}: SuccessMarkProps): ReactElement {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const glyph = GLYPH[tone];
  const length = glyph.length;
  const [pop] = useState(() => new Animated.Value(0));
  const [draw] = useState(() => new Animated.Value(0));
  // Not drawn yet: the whole stroke is still hidden.
  const [offset, setOffset] = useState(length);

  useEffect(() => {
    const listener = draw.addListener(({ value }) => {
      setOffset(length * (1 - value));
    });

    if (reduceMotion) {
      pop.setValue(1);
      draw.setValue(1);

      return () => {
        draw.removeListener(listener);
      };
    }

    const animation = Animated.sequence([
      Animated.spring(pop, {
        toValue: 1,
        useNativeDriver: true,
        stiffness: 170,
        damping: 14,
        mass: 0.8,
      }),
      // The listener moves the stroke, so this one runs on the JS driver.
      Animated.timing(draw, {
        toValue: 1,
        duration: 480,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]);
    animation.start();

    return () => {
      animation.stop();
      draw.removeListener(listener);
    };
  }, [draw, length, pop, reduceMotion]);

  const mark = { success: theme.success, danger: theme.danger, neutral: theme.gold }[tone];
  const soft = { success: theme.successSoft, danger: theme.dangerSoft, neutral: theme.accentSoft }[
    tone
  ];

  return (
    <Animated.View
      style={[
        styles.mark,
        {
          opacity: pop,
          transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }],
        },
      ]}
      testID={testID}
    >
      <Svg width={size} height={size} viewBox="0 0 120 120">
        <Circle cx={60} cy={60} r={56} fill={soft} />
        <Circle cx={60} cy={60} r={56} fill="none" stroke={mark} strokeWidth={1.5} opacity={0.5} />
        <Path
          d={glyph.d}
          fill="none"
          stroke={mark}
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={length}
          strokeDashoffset={offset}
        />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({ mark: { alignSelf: 'center' } });
