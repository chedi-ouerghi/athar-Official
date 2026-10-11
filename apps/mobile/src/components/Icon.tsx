import type { ReactElement } from 'react';
import Svg, { Path } from 'react-native-svg';

export type IconName = 'chevron' | 'check' | 'alert' | 'pause' | 'clock';

/** 24 x 24 outlines, drawn as strokes so they stay crisp at any size. */
const PATHS: Readonly<Record<IconName, string>> = {
  chevron: 'M9 5l7 7-7 7',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M12 7v6M12 17v.01',
  pause: 'M9 6v12M15 6v12',
  clock: 'M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17zM12 7.5V12l3 2',
};

export interface IconProps {
  readonly name: IconName;
  readonly color: string;
  readonly size?: number;
  /**
   * Mirror horizontally in right-to-left layouts. Only for icons that point
   * somewhere (the chevron); a check mark is the same in every language.
   */
  readonly mirror?: boolean;
}

export function Icon({ name, color, size = 20, mirror = false }: IconProps): ReactElement {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={mirror ? { transform: [{ scaleX: -1 }] } : undefined}
    >
      <Path
        d={PATHS[name]}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
