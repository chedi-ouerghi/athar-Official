import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { MIN_TOUCH_TARGET, radius, shadows, spacing } from '../theme';
import { AppText } from './AppText';
import { useTheme } from './use-theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface ButtonProps {
  readonly label: string;
  /**
   * Called on a press. If it returns a promise the button stays busy until it
   * settles, so a slow action cannot be started twice.
   */
  readonly onPress: () => void | Promise<unknown>;
  readonly variant?: ButtonVariant;
  /** Shows a spinner and ignores presses. For work the caller is tracking. */
  readonly loading?: boolean;
  readonly disabled?: boolean;
  readonly accessibilityHint?: string;
  readonly testID?: string;
}

/**
 * After a press whose handler is synchronous (it returns nothing to wait for),
 * further presses are ignored for this long. It absorbs the second tap of a
 * double tap that arrives before the screen has had time to change.
 */
export const SYNC_PRESS_COOLDOWN_MS = 500;

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  );
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  accessibilityHint,
  testID,
}: ButtonProps): ReactElement {
  const theme = useTheme();
  const [pending, setPending] = useState(false);

  // A ref, not state: two taps can land before React re-renders, and only a
  // synchronous flag sees the first one in time.
  const locked = useRef(false);
  const mounted = useRef(true);
  const cooldown = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      clearTimeout(cooldown.current);
    };
  }, []);

  const busy = loading || pending;
  const inactive = disabled || busy;

  const handlePress = useCallback(() => {
    if (disabled || loading || locked.current) {
      return;
    }

    locked.current = true;

    let result: void | Promise<unknown>;

    try {
      result = onPress();
    } catch (error) {
      locked.current = false;
      throw error;
    }

    if (isPromiseLike(result)) {
      setPending(true);

      const release = () => {
        locked.current = false;

        if (mounted.current) {
          setPending(false);
        }
      };

      // The caller owns error handling; the button only needs to know it is over.
      result.then(release, release);
    } else {
      cooldown.current = setTimeout(() => {
        locked.current = false;
      }, SYNC_PRESS_COOLDOWN_MS);
    }
  }, [disabled, loading, onPress]);

  const palette = {
    primary: {
      background: theme.accent,
      pressed: theme.accentPressed,
      text: theme.textOnAccent,
      border: 'transparent',
    },
    secondary: {
      background: theme.surface,
      pressed: theme.surfaceMuted,
      text: theme.text,
      border: theme.border,
    },
    ghost: {
      background: 'transparent',
      pressed: theme.surfaceMuted,
      text: theme.accentText,
      border: 'transparent',
    },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={handlePress}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && !inactive ? shadows.soft : undefined,
        {
          backgroundColor: pressed ? palette.pressed : palette.background,
          borderColor: palette.border,
          opacity: disabled ? 0.45 : 1,
          shadowColor: theme.shadow,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
      ]}
    >
      {/* The label stays in the layout while busy, so the button does not change size. */}
      <View style={busy ? styles.hidden : undefined}>
        <AppText variant="bodyStrong" style={{ color: palette.text }}>
          {label}
        </AppText>
      </View>
      {busy ? (
        <View style={styles.spinner} testID={testID ? `${testID}-spinner` : undefined}>
          <ActivityIndicator color={palette.text} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH_TARGET + 8,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hidden: { opacity: 0 },
  spinner: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
