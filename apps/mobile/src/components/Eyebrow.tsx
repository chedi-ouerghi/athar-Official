import type { ReactElement } from 'react';
import { Text } from 'react-native';
import { EYEBROW_TRACKING, fontFamily } from '../theme';
import { isArabic } from './script';
import { useTheme } from './use-theme';

export interface EyebrowProps {
  readonly children: string;
  /** Muted by default; `accent` for the one that leads a hero. */
  readonly accent?: boolean;
  readonly testID?: string;
}

/**
 * The small line of capitals above a headline: 11px, widely tracked, medium weight.
 * In Arabic it is set plainly (no capitals, no tracking), larger so it stays legible.
 */
export function Eyebrow({ children, accent = false, testID }: EyebrowProps): ReactElement {
  const theme = useTheme();
  const arabic = isArabic(children);

  return (
    <Text
      style={{
        color: accent ? theme.accentText : theme.textMuted,
        fontFamily: fontFamily.medium,
        fontSize: arabic ? 13 : 11,
        lineHeight: arabic ? 22 : 18,
        ...(arabic
          ? null
          : { letterSpacing: EYEBROW_TRACKING, textTransform: 'uppercase' as const }),
      }}
      testID={testID}
    >
      {children}
    </Text>
  );
}
