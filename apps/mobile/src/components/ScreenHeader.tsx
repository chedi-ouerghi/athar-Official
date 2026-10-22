import type { ReactElement, ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { spacing } from '../theme';
import { AppText } from './AppText';
import { DotRule } from './DotRule';
import { Eyebrow } from './Eyebrow';
import { FadeIn } from './FadeIn';
import { Headline } from './Headline';

export interface ScreenHeaderProps {
  /** The title, with the word to light up between asterisks (see `Headline`). */
  readonly title: string;
  readonly subtitle?: string;
  /** A small line of tracked capitals above the title: the section, or the brand. */
  readonly eyebrow?: string;
  /** Something at the far end: an avatar, a button. */
  readonly action?: ReactNode;
  readonly testID?: string;
}

/**
 * The opening of a tab screen, set like the top of the website: a line of small
 * capitals, a large serif title with one word in gold, and a hairline with a dot
 * drifting along it.
 */
export function ScreenHeader({
  title,
  subtitle,
  eyebrow,
  action,
  testID,
}: ScreenHeaderProps): ReactElement {
  return (
    <FadeIn style={styles.wrap}>
      <View style={styles.row}>
        <View style={styles.text}>
          {eyebrow !== undefined ? <Eyebrow>{eyebrow}</Eyebrow> : null}
          <Headline testID={testID}>{title}</Headline>
          {subtitle !== undefined ? <AppText tone="textMuted">{subtitle}</AppText> : null}
        </View>
        {action}
      </View>
      <DotRule />
    </FadeIn>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md, paddingTop: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  text: { flex: 1, gap: spacing.sm },
});
