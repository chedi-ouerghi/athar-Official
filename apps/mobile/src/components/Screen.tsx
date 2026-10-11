import type { ReactElement, ReactNode } from 'react';
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { spacing } from '../theme';
import { useTheme } from './use-theme';

export interface ScreenProps {
  readonly children: ReactNode;
  /** Scroll the content. On by default; turn off for a screen that fills the view. */
  readonly scroll?: boolean;
  readonly contentStyle?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

/** Widest the content grows on a tablet, so lines stay readable. */
const MAX_CONTENT_WIDTH = 640;

/** The frame of every screen: safe area, background, padding, optional scrolling. */
export function Screen({
  children,
  scroll = true,
  contentStyle,
  testID,
}: ScreenProps): ReactElement {
  const theme = useTheme();
  const content = [styles.content, contentStyle];

  return (
    <SafeAreaView
      edges={['top', 'bottom', 'left', 'right']}
      style={[styles.safeArea, { backgroundColor: theme.background }]}
      testID={testID}
    >
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, content]}
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.fill, content]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
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
});
