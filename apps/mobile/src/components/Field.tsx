import { useState, type ReactElement } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type ReturnKeyTypeOptions,
} from 'react-native';
import { useI18n } from '../i18n/context';
import { MIN_TOUCH_TARGET, motion, radius, spacing, typography } from '../theme';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { useTheme } from './use-theme';

export interface FieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (text: string) => void;
  /** A password: hidden, with a button to show it. */
  readonly secure?: boolean;
  readonly keyboardType?: KeyboardTypeOptions;
  readonly returnKeyType?: ReturnKeyTypeOptions;
  readonly placeholder?: string;
  readonly maxLength?: number;
  readonly autoFocus?: boolean;
  /** The value is wrong: the edge turns red and stays red while focused. */
  readonly invalid?: boolean;
  readonly onSubmitEditing?: () => void;
  readonly testID: string;
}

/**
 * A labelled text field. Its edge turns gold while it has focus, so the user
 * always knows where the keyboard is typing, and red when the value is wrong.
 */
export function Field({
  label,
  value,
  onChangeText,
  secure = false,
  keyboardType = 'default',
  returnKeyType,
  placeholder,
  maxLength,
  autoFocus = false,
  invalid = false,
  onSubmitEditing,
  testID,
}: FieldProps): ReactElement {
  const { t } = useI18n();
  const theme = useTheme();
  const [focus] = useState(() => new Animated.Value(0));
  const [revealed, setRevealed] = useState(false);

  const animateTo = (toValue: number) => {
    // Colours and widths cannot run on the native driver.
    Animated.timing(focus, { toValue, duration: motion.fast, useNativeDriver: false }).start();
  };

  return (
    <View style={styles.field}>
      <AppText variant="label" tone="textMuted">
        {label}
      </AppText>
      <Animated.View
        style={[
          styles.box,
          {
            backgroundColor: theme.surface,
            borderColor: focus.interpolate({
              inputRange: [0, 1],
              outputRange: [
                invalid ? theme.danger : theme.border,
                invalid ? theme.danger : theme.gold,
              ],
            }),
            borderWidth: focus.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }),
          },
        ]}
      >
        <TextInput
          accessibilityLabel={label}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus={autoFocus}
          keyboardType={keyboardType}
          maxLength={maxLength}
          onBlur={() => {
            animateTo(0);
          }}
          onChangeText={onChangeText}
          onFocus={() => {
            animateTo(1);
          }}
          onSubmitEditing={onSubmitEditing}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          returnKeyType={returnKeyType}
          secureTextEntry={secure && !revealed}
          selectionColor={theme.gold}
          style={[styles.input, typography.body, { color: theme.text }]}
          testID={testID}
          value={value}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(revealed ? 'signIn.hidePassword' : 'signIn.showPassword')}
            hitSlop={8}
            onPress={() => {
              setRevealed(!revealed);
            }}
            style={styles.reveal}
            testID={`${testID}-reveal`}
          >
            <Icon name={revealed ? 'eyeOff' : 'eye'} color={theme.textMuted} size={20} />
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs + 2 },
  box: {
    minHeight: MIN_TOUCH_TARGET + 6,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  // `minWidth: 0` lets the input shrink inside the row; a web input otherwise keeps its own width.
  input: { flex: 1, minHeight: MIN_TOUCH_TARGET, minWidth: 0 },
  reveal: { padding: spacing.xs },
});
