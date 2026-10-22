import type { ReactElement, ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TAB_BAR_CLEARANCE, spacing } from '../theme';
import { GlowFill, GradientFill } from './GradientFill';
import { useIsDark, useTheme } from './use-theme';

export interface ScreenProps {
  readonly children: ReactNode;
  /** Scroll the content. On by default; turn off for a screen that fills the view. */
  readonly scroll?: boolean;
  readonly contentStyle?: StyleProp<ViewStyle>;
  /** A screen in the tab bar: leaves room for the floating bar under the content. */
  readonly tabBar?: boolean;
  /**
   * A bar pinned to the bottom (the main action of the screen). The content
   * scrolls under it, with a fade so nothing is cut hard.
   */
  readonly footer?: ReactNode;
  /** The soft gold light at the top. On by default; off for a screen that is mostly a camera. */
  readonly glow?: boolean;
  readonly testID?: string;
}

/** Widest the content grows on a tablet, so lines stay readable. */
const MAX_CONTENT_WIDTH = 640;

/** About the height of a pinned footer with a button in it. */
const FOOTER_CLEARANCE = 112;

/**
 * The frame of every screen: background with its glow of light, safe area,
 * padding, optional scrolling, and the two things that sit above the content (the
 * tab bar's room and a pinned footer).
 */
export function Screen({
  children,
  scroll = true,
  contentStyle,
  tabBar = false,
  footer,
  glow = true,
  testID,
}: ScreenProps): ReactElement {
  const theme = useTheme();
  const dark = useIsDark();
  const hasFooter = footer !== undefined;
  const bottomRoom = (tabBar ? TAB_BAR_CLEARANCE : 0) + (hasFooter ? FOOTER_CLEARANCE : 0);
  const content = [styles.content, contentStyle];

  return (
    <View style={[styles.root, { backgroundColor: theme.background }]} testID={testID}>
      {glow ? (
        <View style={styles.glow}>
          <GlowFill color={theme.glow} opacity={dark ? 0.2 : 0.32} />
        </View>
      ) : null}

      <SafeAreaView
        edges={tabBar || hasFooter ? ['top', 'left', 'right'] : ['top', 'bottom', 'left', 'right']}
        style={styles.safeArea}
      >
        {scroll ? (
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              content,
              { paddingBottom: spacing.lg + bottomRoom },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.fill, content]}>{children}</View>
        )}
      </SafeAreaView>

      {hasFooter ? (
        <SafeAreaView edges={['bottom']} style={styles.footer}>
          <View style={styles.footerFade}>
            <GradientFill
              from={theme.background}
              to={theme.background}
              direction="vertical"
              fromOpacity={0}
            />
          </View>
          <View style={styles.footerContent}>{footer}</View>
        </SafeAreaView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  glow: { position: 'absolute', top: 0, start: 0, end: 0, height: 360, pointerEvents: 'none' },
  safeArea: { flex: 1 },
  fill: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  content: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    padding: spacing.lg,
    gap: spacing.md,
  },
  footer: { position: 'absolute', start: 0, end: 0, bottom: 0 },
  footerFade: { position: 'absolute', top: 0, start: 0, end: 0, bottom: 0 },
  footerContent: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
});
