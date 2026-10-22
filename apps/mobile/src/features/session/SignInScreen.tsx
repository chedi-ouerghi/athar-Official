import { useState, type ReactElement } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { errorMessageKey } from '../../api/error-messages';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { LanguageSwitch } from '../../components/LanguageSwitch';
import { Screen } from '../../components/Screen';
import { useTheme } from '../../components/use-theme';
import { useI18n } from '../../i18n/context';
import { useSession } from '../../session/SessionProvider';
import { MIN_TOUCH_TARGET, radius, spacing, typography } from '../../theme';
import { useAction } from '../use-action';

/**
 * Sign in, or activate an account with the one-time code an admin handed out. On
 * success the session changes and the router moves on by itself.
 */
export function SignInScreen(): ReactElement {
  const { t } = useI18n();
  const theme = useTheme();
  const session = useSession();
  const [activating, setActivating] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');

  const submit = useAction(() =>
    activating
      ? session.activate({ email, activationCode: code, password })
      : session.signIn({ email, password }),
  );

  const ready = email.trim() !== '' && password !== '' && (!activating || code.trim() !== '');

  const field = (
    label: string,
    value: string,
    onChange: (text: string) => void,
    options: { secure?: boolean; testID: string; keyboard?: 'email-address' },
  ) => (
    <View style={styles.field}>
      <AppText variant="label" tone="textMuted">
        {label}
      </AppText>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={options.keyboard ?? 'default'}
        onChangeText={onChange}
        secureTextEntry={options.secure === true}
        style={[
          styles.input,
          typography.body,
          { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border },
        ]}
        testID={options.testID}
        value={value}
      />
    </View>
  );

  return (
    <Screen testID="sign-in-screen">
      <AppText variant="title" accessibilityRole="header">
        {t('signIn.title')}
      </AppText>

      {field(t('signIn.email'), email, setEmail, {
        testID: 'sign-in-email',
        keyboard: 'email-address',
      })}
      {activating ? field(t('signIn.code'), code, setCode, { testID: 'sign-in-code' }) : null}
      {field(activating ? t('signIn.newPassword') : t('signIn.password'), password, setPassword, {
        secure: true,
        testID: 'sign-in-password',
      })}

      {submit.state.status === 'error' ? (
        <AppText tone="danger" accessibilityRole="alert" testID="sign-in-error">
          {t(errorMessageKey(submit.state.error))}
        </AppText>
      ) : null}

      <Button
        label={activating ? t('signIn.activate') : t('signIn.submit')}
        disabled={!ready}
        onPress={submit.run}
        testID="sign-in-submit"
      />
      <Button
        label={activating ? t('signIn.haveAccount') : t('signIn.haveCode')}
        variant="ghost"
        onPress={() => {
          setActivating(!activating);
        }}
        testID="sign-in-toggle"
      />
      <LanguageSwitch />
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.xs },
  input: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
  },
});
