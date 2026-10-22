import { useId, type ReactElement } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

export type GradientDirection = 'diagonal' | 'vertical' | 'horizontal';

export interface GradientFillProps {
  readonly from: string;
  readonly to: string;
  /** A colour between the two, at `viaOffset` (the website's gradient has one at 55%). */
  readonly via?: string;
  readonly viaOffset?: number;
  readonly direction?: GradientDirection;
  /** Opacity of each end, 0 to 1. A colour fading to nothing is `toOpacity={0}`. */
  readonly fromOpacity?: number;
  readonly toOpacity?: number;
  readonly style?: StyleProp<ViewStyle>;
}

const AXES = {
  diagonal: { x1: '0', y1: '0', x2: '1', y2: '1' },
  vertical: { x1: '0', y1: '0', x2: '0', y2: '1' },
  horizontal: { x1: '0', y1: '0', x2: '1', y2: '0' },
} as const;

/** `useId` yields ids like `:r1:`, which are not valid inside `url(#...)`. */
function useGradientId(): string {
  return `g${useId().replace(/\W/g, '')}`;
}

/**
 * A gradient that fills its parent, drawn with SVG so it needs no native module.
 * Put it first inside a view that has `overflow: 'hidden'` and a radius.
 */
export function GradientFill({
  from,
  to,
  via,
  viaOffset = 0.55,
  direction = 'diagonal',
  fromOpacity = 1,
  toOpacity = 1,
  style,
}: GradientFillProps): ReactElement {
  const id = useGradientId();

  return (
    <Svg
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      style={[StyleSheet.absoluteFill, styles.passive, style]}
    >
      <Defs>
        <LinearGradient id={id} {...AXES[direction]}>
          {[
            { offset: 0, color: from, opacity: fromOpacity },
            ...(via === undefined ? [] : [{ offset: viaOffset, color: via, opacity: 1 }]),
            { offset: 1, color: to, opacity: toOpacity },
          ].map((stop) => (
            <Stop
              key={stop.offset}
              offset={stop.offset}
              stopColor={stop.color}
              stopOpacity={stop.opacity}
            />
          ))}
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

export interface GlowFillProps {
  readonly color: string;
  /** Opacity at the centre of the glow; it fades to nothing at the edge. */
  readonly opacity?: number;
  /** Where the light comes from, as a fraction of the width and height. */
  readonly originX?: number;
  readonly originY?: number;
  readonly style?: StyleProp<ViewStyle>;
}

/** A soft pool of light, for the background of a hero area. */
export function GlowFill({
  color,
  opacity = 0.25,
  originX = 0.5,
  originY = 0,
  style,
}: GlowFillProps): ReactElement {
  const id = useGradientId();

  return (
    <Svg
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      style={[StyleSheet.absoluteFill, styles.passive, style]}
    >
      <Defs>
        <RadialGradient
          id={id}
          cx={`${originX * 100}%`}
          cy={`${originY * 100}%`}
          rx="75%"
          ry="60%"
          fx={`${originX * 100}%`}
          fy={`${originY * 100}%`}
        >
          <Stop offset="0" stopColor={color} stopOpacity={opacity} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  /** A decoration never takes a touch from what is on top of it. */
  passive: { pointerEvents: 'none' },
});
