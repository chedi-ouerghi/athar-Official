import type { ReactElement } from 'react';
import Svg, { Path } from 'react-native-svg';

export type IconName =
  | 'chevron'
  | 'check'
  | 'alert'
  | 'pause'
  | 'clock'
  | 'home'
  | 'scan'
  | 'user'
  | 'sun'
  | 'moon'
  | 'contrast'
  | 'globe'
  | 'plug'
  | 'logout'
  | 'bulb'
  | 'share'
  | 'sparkle'
  | 'play'
  | 'stop'
  | 'eye'
  | 'eyeOff'
  | 'table';

/** 24 x 24 outlines, drawn as strokes so they stay crisp at any size. */
const PATHS: Readonly<Record<IconName, string>> = {
  chevron: 'M9 5l7 7-7 7',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M12 7v6M12 17v.01',
  pause: 'M9 6v12M15 6v12',
  clock: 'M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17zM12 7.5V12l3 2',
  home: 'M4 11.2L12 4.5l8 6.7V19a1 1 0 01-1 1h-4.2v-5.5H9.2V20H5a1 1 0 01-1-1v-7.8z',
  scan: 'M4 8.5V6.5A2.5 2.5 0 016.5 4h2M15.5 4h2A2.5 2.5 0 0120 6.5v2M20 15.5v2a2.5 2.5 0 01-2.5 2.5h-2M8.5 20h-2A2.5 2.5 0 014 17.5v-2M7.5 12h9',
  user: 'M12 12.2a4.1 4.1 0 100-8.2 4.1 4.1 0 000 8.2zM4.6 20a7.4 7.4 0 0114.8 0',
  sun: 'M12 16.5a4.5 4.5 0 100-9 4.5 4.5 0 000 9zM12 2.8v2M12 19.2v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2.8 12h2M19.2 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.2A8 8 0 019.8 4 8 8 0 1020 14.2z',
  contrast: 'M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17zM12 3.5v17',
  globe:
    'M12 3.5a8.5 8.5 0 100 17 8.5 8.5 0 000-17zM3.5 12h17M12 3.5c2.4 2.5 3.5 5.3 3.5 8.5s-1.1 6-3.5 8.5C9.6 18 8.5 15.2 8.5 12S9.6 6 12 3.5z',
  plug: 'M9 3v4M15 3v4M7 7h10v4a5 5 0 01-10 0V7zM12 16v5',
  logout: 'M10 4.5H6.5A1.5 1.5 0 005 6v12a1.5 1.5 0 001.5 1.5H10M15 8l4 4-4 4M19 12H9.5',
  bulb: 'M9.5 18h5M10.5 21h3M12 3.5a5.7 5.7 0 00-3.3 10.4c.6.5 1 1.2 1 2V16h4.6v-.1c0-.8.4-1.5 1-2A5.7 5.7 0 0012 3.5z',
  share: 'M12 15.5V4M8.2 7.8L12 4l3.8 3.8M5 13v5a2 2 0 002 2h10a2 2 0 002-2v-5',
  sparkle: 'M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9L12 3.5z',
  play: 'M8 5.5v13l10.5-6.5L8 5.5z',
  stop: 'M7.5 7.5h9v9h-9z',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 14.8a2.8 2.8 0 100-5.6 2.8 2.8 0 000 5.6z',
  eyeOff:
    'M4 4l16 16M9.9 6A9.4 9.4 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 01-3 3.7M6.3 7.7A15.8 15.8 0 002.5 12S6 18.5 12 18.5a9 9 0 004-.9M10.2 10.2a2.8 2.8 0 004 4',
  table: 'M4.5 5.5h15M3.5 9h17M6 9v10M18 9v10',
};

export interface IconProps {
  readonly name: IconName;
  readonly color: string;
  readonly size?: number;
  /** Line weight on the 24 grid. Slightly heavier than the default for small icons. */
  readonly strokeWidth?: number;
  /**
   * Mirror horizontally in right-to-left layouts. Only for icons that point
   * somewhere (the chevron); a check mark is the same in every language.
   */
  readonly mirror?: boolean;
}

export function Icon({
  name,
  color,
  size = 20,
  strokeWidth = 1.9,
  mirror = false,
}: IconProps): ReactElement {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      // Positioned, so on the web it stays above a gradient laid behind it with `absolute`.
      style={[{ position: 'relative' }, mirror ? { transform: [{ scaleX: -1 }] } : null]}
    >
      <Path
        d={PATHS[name]}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
