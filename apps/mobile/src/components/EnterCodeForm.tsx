import { useState, type ReactElement } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { useI18n } from '../i18n/context';
import { parseTableCode } from '../linking/parse-table-code';
import { MIN_TOUCH_TARGET, radius, spacing, typography } from '../theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { useTheme } from './use-theme';

export interface EnterCodeFormProps {
  /** Hosts whose HTTPS links are accepted (`environment.tableLinkHosts`). */
  readonly allowedHosts: readonly string[];
  /** Called with a table id that passed the same validation as a scanned code. */
  readonly onTable: (tableId: string) => void;
  readonly autoFocus?: boolean;
}

/**
 * The typed alternative to scanning: a table id, or a whole link pasted in. It
 * goes through the same parser as the scanner, so both accept exactly the same
 * codes.
 */
export function EnterCodeForm({
  allowedHosts,
  onTable,
  autoFocus = false,
}: EnterCodeFormProps): ReactElement {
  const { t } = useI18n();
  const theme = useTheme();
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);

  const submit = () => {
    const parsed = parseTableCode(value, { allowedHosts });

    if (parsed.tableId === undefined) {
      setInvalid(true);
      return;
    }

    setInvalid(false);
    onTable(parsed.tableId);
  };

  return (
    <View style={styles.container}>
      <AppText variant="label" tone="textMuted">
        {t('code.label')}
      </AppText>
      <TextInput
        accessibilityLabel={t('code.label')}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus={autoFocus}
        onChangeText={(text) => {
          setValue(text);
          setInvalid(false);
        }}
        onSubmitEditing={submit}
        placeholder={t('code.placeholder')}
        placeholderTextColor={theme.textMuted}
        returnKeyType="go"
        style={[
          styles.input,
          typography.body,
          {
            color: theme.text,
            backgroundColor: theme.surface,
            borderColor: invalid ? theme.danger : theme.border,
          },
        ]}
        testID="code-input"
        value={value}
      />
      {invalid ? (
        <AppText variant="caption" tone="danger" accessibilityRole="alert" testID="code-invalid">
          {t('code.invalid')}
        </AppText>
      ) : null}
      <Button label={t('code.submit')} onPress={submit} testID="code-submit" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  input: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
  },
});
