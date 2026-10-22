import type { ReactElement } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { editorial, fontFamily, serifFamily, typography } from '../theme';
import { isArabic } from './script';
import { useTheme } from './use-theme';

export interface HeadlineProps {
  /**
   * The headline, with the word to light up between asterisks:
   * `Art in motion, a trace that *endures*.` The marked part is set in champagne
   * gold, and in italic in Latin, as on the website.
   */
  readonly children: string;
  readonly variant?: 'hero' | 'display' | 'title';
  readonly style?: StyleProp<TextStyle>;
  readonly testID?: string;
}

/** Splits `a *b* c` into `[{text:'a ', accent:false}, {text:'b', accent:true}, ...]`. */
function segments(text: string): { readonly text: string; readonly accent: boolean }[] {
  return text
    .split('*')
    .map((part, index) => ({ text: part, accent: index % 2 === 1 }))
    .filter((part) => part.text !== '');
}

/**
 * The large title of a screen, the way the website sets its own: the serif in
 * capitals with one word picked out in italic gold. In Arabic the same headline
 * keeps its letters joined (no serif, no capitals, no italic) and only the marked
 * word takes the gold.
 */
export function Headline({
  children,
  variant = 'display',
  style,
  testID,
}: HeadlineProps): ReactElement {
  const theme = useTheme();
  const arabic = isArabic(children);
  const base = arabic ? typography[variant === 'title' ? 'title' : 'display'] : editorial[variant];

  return (
    <Text
      accessibilityRole="header"
      style={[base, { color: theme.text }, arabic ? null : { textTransform: 'uppercase' }, style]}
      testID={testID}
    >
      {segments(children).map((part, index) =>
        part.accent ? (
          <Text
            key={index}
            style={{
              color: theme.accentText,
              textTransform: 'none',
              fontFamily: arabic ? fontFamily.bold : serifFamily.italic,
            }}
          >
            {part.text}
          </Text>
        ) : (
          part.text
        ),
      )}
    </Text>
  );
}
