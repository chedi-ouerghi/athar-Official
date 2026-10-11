import { useMemo, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from './use-theme';

export interface OrnamentProps {
  /** Side of the square, in pixels. */
  readonly size: number;
  /** 0..1. A whisper behind text, stronger as a centrepiece. */
  readonly strength?: number;
}

/**
 * A spiral inside concentric rims: the shape of a sand table with a pattern
 * half-drawn in it. Decorative only; screen readers skip it. Generated from
 * arithmetic, so there is no image to ship and it takes the theme's colours.
 */
export function Ornament({ size, strength = 0.5 }: OrnamentProps): ReactElement {
  const theme = useTheme();

  const spiral = useMemo(() => {
    const turns = 7;
    const steps = 360;
    const points: string[] = [];

    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const angle = t * turns * 2 * Math.PI;
      // A gentle wobble, like wind in the sand, kept small so it reads as hand-made.
      const radius = 0.94 * t * (1 + 0.025 * Math.sin(angle * 5));
      points.push(
        `${step === 0 ? 'M' : 'L'}${(radius * Math.cos(angle)).toFixed(4)} ${(radius * Math.sin(angle)).toFixed(4)}`,
      );
    }

    return points.join('');
  }, []);

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[styles.box, { width: size, height: size, opacity: strength }]}
    >
      <Svg width={size} height={size} viewBox="-1.05 -1.05 2.1 2.1">
        <Circle r={1} fill="none" stroke={theme.gold} strokeWidth={0.012} />
        <Circle r={0.97} fill="none" stroke={theme.pathFaint} strokeWidth={0.006} />
        <Path
          d={spiral}
          fill="none"
          stroke={theme.pathFaint}
          strokeWidth={0.01}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({ box: { overflow: 'hidden' } });
