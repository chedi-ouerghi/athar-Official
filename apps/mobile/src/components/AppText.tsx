import type { ReactElement } from 'react';
import { Text, type TextProps } from 'react-native';
import { typography, type TextVariant, type Theme } from '../theme';
import { useTheme } from './use-theme';

export type TextTone = keyof Pick<
  Theme,
  'text' | 'textMuted' | 'accentText' | 'danger' | 'success' | 'warning'
>;

export interface AppTextProps extends TextProps {
  readonly variant?: TextVariant;
  readonly tone?: TextTone;
}

/**
 * Text in the app's typeface and colours. Every visible string goes through it,
 * so the font (which carries Arabic and Latin) is never forgotten. It sets no
 * `textAlign`: text aligns to its own script's start, which is right in both
 * directions.
 */
export function AppText({
  variant = 'body',
  tone = 'text',
  style,
  ...rest
}: AppTextProps): ReactElement {
  const theme = useTheme();

  return <Text {...rest} style={[typography[variant], { color: theme[tone] }, style]} />;
}
