import { useState, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { errorMessageKey } from '../../api/error-messages';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DotRule } from '../../components/DotRule';
import { FadeIn, staggerDelay } from '../../components/FadeIn';
import { Field } from '../../components/Field';
import { Headline } from '../../components/Headline';
import { LanguageSwitch } from '../../components/LanguageSwitch';
import { Ornament } from '../../components/Ornament';
import { Screen } from '../../components/Screen';
import { SegmentedControl } from '../../components/SegmentedControl';
import { useI18n } from '../../i18n/context';
import { useSession } from '../../session/SessionProvider';
import { spacing } from '../../theme';
import { useAction } from '../use-action';

type Mode = 'signIn' | 'activate';

/**
 * Sign in, or activate an account with the one-time code an admin handed out. On
 * success the session changes and the router moves on by itself.
 */
export function SignInScreen(): ReactElement {
  const { t } = useI18n();
  const session = useSession();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const activating = mode === 'activate';

  const submit = useAction(() =>
    activating
      ? session.activate({ email, activationCode: code, password })
      : session.signIn({ email, password }),
  );

  const ready = email.trim() !== '' && password !== '' && (!activating || code.trim() !== '');

  return (
    <Screen testID="sign-in-screen" contentStyle={styles.content}>
      <FadeIn style={styles.brand}>
        <Ornament size={92} strength={0.85} />
        <Headline variant="title" style={styles.title}>
          {t('signIn.title')}
        </Headline>
        <View style={styles.rule}>
          <DotRule />
        </View>
        <AppText tone="textMuted" style={styles.subtitle}>
          {t('signIn.subtitle')}
        </AppText>
      </FadeIn>

      <FadeIn delay={staggerDelay(1)}>
        <SegmentedControl<Mode>
          options={[
            { value: 'signIn', label: t('signIn.tab.signIn'), testID: 'sign-in-tab-signin' },
            { value: 'activate', label: t('signIn.tab.activate'), testID: 'sign-in-tab-activate' },
          ]}
          value={mode}
          onChange={setMode}
        />
      </FadeIn>

      <FadeIn delay={staggerDelay(2)}>
        <Card tone="elevated" style={styles.form}>
          <Field
            keyboardType="email-address"
            label={t('signIn.email')}
            onChangeText={setEmail}
            testID="sign-in-email"
            value={email}
          />
          {activating ? (
            <Field
              label={t('signIn.code')}
              onChangeText={setCode}
              testID="sign-in-code"
              value={code}
            />
          ) : null}
          <Field
            label={activating ? t('signIn.newPassword') : t('signIn.password')}
            onChangeText={setPassword}
            secure
            testID="sign-in-password"
            value={password}
          />

          {submit.state.status === 'error' ? (
            <AppText tone="danger" accessibilityRole="alert" testID="sign-in-error">
              {t(errorMessageKey(submit.state.error))}
            </AppText>
          ) : null}

          <Button
            label={activating ? t('signIn.activate') : t('signIn.submit')}
            dot
            disabled={!ready}
            onPress={submit.run}
            testID="sign-in-submit"
          />
        </Card>
      </FadeIn>

      <FadeIn delay={staggerDelay(3)} style={styles.language}>
        <LanguageSwitch />
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { justifyContent: 'center', gap: spacing.lg },
  brand: { alignItems: 'center', gap: spacing.md },
  title: { textAlign: 'center' },
  rule: { alignSelf: 'stretch' },
  subtitle: { textAlign: 'center', maxWidth: 290 },
  form: { gap: spacing.md },
  language: { paddingHorizontal: spacing.sm },
});
