import type { ReactElement } from 'react';
import { Text, type TextProps } from 'react-native';
import { editorial, typography, type TextVariant, type Theme } from '../theme';
import { containsArabic } from './script';
import { useTheme } from './use-theme';

export type TextTone = keyof Pick<
  Theme,
  'text' | 'textMuted' | 'accentText' | 'danger' | 'success' | 'warning'
>;

export interface AppTextProps extends TextProps {
  readonly variant?: TextVariant;
  readonly tone?: TextTone;
}

/** The variants that become editorial serif headlines when their text is Latin. */
const EDITORIAL_VARIANTS = ['hero', 'display', 'title'] as const;

function isEditorial(variant: TextVariant): variant is (typeof EDITORIAL_VARIANTS)[number] {
  return (EDITORIAL_VARIANTS as readonly string[]).includes(variant);
}

/**
 * Text in the app's typeface and colours. Every visible string goes through it,
 * so the font (which carries Arabic and Latin) is never forgotten.
 *
 * Headlines (`hero`, `display`, `title`) take the website's look in Latin: the
 * Instrument Serif face, tight tracking, and capitals for the two largest. Arabic
 * text keeps IBM Plex Sans Arabic with no tracking and no case change, because both
 * would break the joins between its letters. It sets no `textAlign`: text aligns to
 * its own script's start, which is right in both directions.
 */
export function AppText({
  variant = 'body',
  tone = 'text',
  style,
  children,
  ...rest
}: AppTextProps): ReactElement {
  const theme = useTheme();
  const serif = isEditorial(variant) && !containsArabic(children);

  return (
    <Text
      {...rest}
      style={[
        serif ? editorial[variant] : typography[variant],
        serif && variant !== 'title' ? { textTransform: 'uppercase' } : null,
        { color: theme[tone] },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
