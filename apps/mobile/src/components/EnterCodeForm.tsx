import { useState, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { useI18n } from '../i18n/context';
import { parsePairingQr, type PairingQr } from '../linking/parse-pairing-qr';
import { spacing } from '../theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { Field } from './Field';

export interface EnterCodeFormProps {
  /** Hosts whose HTTPS links are accepted (`environment.tableLinkHosts`). */
  readonly allowedHosts: readonly string[];
  /** A pairing link (a claim or an invitation) was typed or pasted. */
  readonly onPairing: (link: PairingQr) => void;
  readonly autoFocus?: boolean;
}

/**
 * The typed alternative to scanning: the pairing link of the table, pasted in. It
 * goes through the same parser as the scanner, so both accept exactly the same
 * links, and a bare table id opens nothing.
 */
export function EnterCodeForm({
  allowedHosts,
  onPairing,
  autoFocus = false,
}: EnterCodeFormProps): ReactElement {
  const { t } = useI18n();
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);

  const submit = () => {
    const pairing = parsePairingQr(value, { allowedHosts });

    if (pairing === null) {
      setInvalid(true);
      return;
    }

    setInvalid(false);
    onPairing(pairing);
  };

  return (
    <View style={styles.container}>
      <Field
        autoFocus={autoFocus}
        invalid={invalid}
        label={t('code.label')}
        onChangeText={(text) => {
          setValue(text);
          setInvalid(false);
        }}
        onSubmitEditing={submit}
        placeholder={t('code.placeholder')}
        returnKeyType="go"
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
});
