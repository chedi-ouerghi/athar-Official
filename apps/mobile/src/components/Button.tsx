import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { MIN_TOUCH_TARGET, radius, shadows, spacing } from '../theme';
import { AppText } from './AppText';
import { GradientFill } from './GradientFill';
import { Icon, type IconName } from './Icon';
import { PressableScale } from './PressableScale';
import { useTheme } from './use-theme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps {
  readonly label: string;
  /**
   * Called on a press. If it returns a promise the button stays busy until it
   * settles, so a slow action cannot be started twice.
   */
  readonly onPress: () => void | Promise<unknown>;
  readonly variant?: ButtonVariant;
  /** An icon before the label. */
  readonly icon?: IconName;
  /** The small dot after the label that ends the website's main call to action. */
  readonly dot?: boolean;
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

/** The light catching the top edge of the gold, and the shade under its bottom edge. */
const SHEEN_TOP = 'rgba(255, 245, 228, 0.55)';
const SHEEN_BOTTOM = 'rgba(90, 52, 22, 0.35)';

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  dot = false,
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

  const primary = variant === 'primary';
  const palette = {
    primary: { text: theme.textOnAccent, border: 'transparent' },
    secondary: { text: theme.text, border: theme.gold },
    ghost: { text: theme.accentText, border: 'transparent' },
    danger: { text: theme.danger, border: theme.danger },
  }[variant];

  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={handlePress}
      testID={testID}
      // The glow lives out here: the surface inside clips its gradient to the pill, which
      // would also clip a shadow drawn on the same view.
      style={[
        styles.outer,
        primary && !inactive ? shadows.glow : undefined,
        { opacity: disabled ? 0.45 : 1, shadowColor: theme.glow },
      ]}
    >
      <View style={[styles.surface, { borderColor: palette.border }]}>
        {primary ? (
          <>
            <GradientFill
              from={theme.gradientStart}
              via={theme.gradientMid}
              to={theme.gradientEnd}
            />
            <View style={[styles.sheen, styles.sheenTop, { backgroundColor: SHEEN_TOP }]} />
            <View style={[styles.sheen, styles.sheenBottom, { backgroundColor: SHEEN_BOTTOM }]} />
          </>
        ) : null}

        {/* The label stays in the layout while busy, so the button does not change size. */}
        <View style={[styles.row, busy ? styles.hidden : undefined]}>
          {icon !== undefined ? <Icon name={icon} color={palette.text} size={20} /> : null}
          <AppText variant="bodyStrong" style={{ color: palette.text }}>
            {label}
          </AppText>
          {dot ? <View style={[styles.dot, { backgroundColor: palette.text }]} /> : null}
        </View>
        {busy ? (
          <View style={styles.spinner} testID={testID ? `${testID}-spinner` : undefined}>
            <ActivityIndicator color={palette.text} />
          </View>
        ) : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  outer: { borderRadius: radius.pill },
  surface: {
    minHeight: MIN_TOUCH_TARGET + 10,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  sheen: { position: 'absolute', start: 0, end: 0, height: 1 },
  sheenTop: { top: 0 },
  sheenBottom: { bottom: 0 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  dot: { width: 6, height: 6, borderRadius: 3 },
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
