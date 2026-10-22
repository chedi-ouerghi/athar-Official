import type { LightInput } from '@athar/contracts';
import { useRef, useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { errorMessageKey } from '../../api/error-messages';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { useTheme } from '../../components/use-theme';
import { useI18n } from '../../i18n/context';
import { MIN_TOUCH_TARGET, radius, spacing, typography } from '../../theme';
import { BRIGHTNESS_STEP, SWATCHES, normaliseHex, stepBrightness } from './light-state';
import { useSetLight } from './useSetLight';

/**
 * The table's light: off, on, or a colour at a brightness.
 *
 * Optimistic: a choice shows on screen at once and the command follows in the
 * background. Commands are sent one after the other so the table ends on the last
 * choice; if the latest one fails, the screen goes back to the last choice the
 * table confirmed and says so. (The API does not report the current colour, so
 * nothing is selected until the user picks.)
 */
export function LightControl({ tableId }: { readonly tableId: string }): ReactElement {
  const { t } = useI18n();
  const theme = useTheme();
  const setLight = useSetLight(tableId);

  const [shown, setShown] = useState<LightInput | null>(null);
  const [brightness, setBrightness] = useState(100);
  const [hex, setHex] = useState('');
  const [error, setError] = useState<unknown>(undefined);

  const confirmed = useRef<LightInput | null>(null);
  const latest = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const apply = (next: LightInput) => {
    const mine = ++latest.current;

    setShown(next);
    setError(undefined);

    queue.current = queue.current.then(async () => {
      try {
        await setLight(next);
        confirmed.current = next;
      } catch (failure) {
        // An older command failing is moot: a newer one has replaced it.
        if (mine === latest.current) {
          setShown(confirmed.current);
          setError(failure);
        }
      }
    });
  };

  const color = shown?.mode === 'color' ? shown.color : undefined;
  const hexInvalid = hex.length > 0 && normaliseHex(hex) === undefined;

  const chooseColor = (value: string, level = brightness) => {
    apply({ mode: 'color', color: value, brightness: level });
  };

  const changeBrightness = (delta: number) => {
    const level = stepBrightness(brightness, delta);

    setBrightness(level);

    if (color !== undefined) {
      chooseColor(color, level);
    }
  };

  return (
    <View style={styles.container} testID="light-control">
      <AppText variant="heading">{t('light.title')}</AppText>

      <View style={styles.row}>
        <Button
          label={t('light.off')}
          variant={shown?.mode === 'off' ? 'primary' : 'secondary'}
          onPress={() => {
            apply({ mode: 'off' });
          }}
          testID="light-off"
        />
        <Button
          label={t('light.on')}
          variant={shown?.mode === 'on' ? 'primary' : 'secondary'}
          onPress={() => {
            apply({ mode: 'on' });
          }}
          testID="light-on"
        />
      </View>

      <View style={styles.row}>
        {SWATCHES.map((swatch) => (
          <Pressable
            key={swatch}
            accessibilityRole="button"
            accessibilityLabel={swatch}
            accessibilityState={{ selected: color === swatch }}
            onPress={() => {
              setHex('');
              chooseColor(swatch);
            }}
            style={[
              styles.swatch,
              {
                backgroundColor: swatch,
                borderColor: color === swatch ? theme.text : theme.border,
                borderWidth: color === swatch ? 3 : 1,
              },
            ]}
            testID={`light-swatch-${swatch}`}
          />
        ))}
      </View>

      <TextInput
        accessibilityLabel={t('light.hexLabel')}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={7}
        onChangeText={(text) => {
          setHex(text);

          const parsed = normaliseHex(text);

          if (parsed !== undefined) {
            chooseColor(parsed);
          }
        }}
        placeholder="#ff8800"
        placeholderTextColor={theme.textMuted}
        style={[
          styles.input,
          typography.body,
          {
            color: theme.text,
            backgroundColor: theme.surface,
            borderColor: hexInvalid ? theme.danger : theme.border,
          },
        ]}
        testID="light-hex"
        value={hex}
      />
      {hexInvalid ? (
        <AppText
          variant="caption"
          tone="danger"
          accessibilityRole="alert"
          testID="light-hex-invalid"
        >
          {t('light.hexInvalid')}
        </AppText>
      ) : null}

      <AppText tone="textMuted" testID="light-brightness">
        {t('light.brightness', { percent: `${brightness}%` })}
      </AppText>
      <View style={styles.row}>
        <Button
          label={t('light.dimmer')}
          variant="secondary"
          onPress={() => {
            changeBrightness(-BRIGHTNESS_STEP);
          }}
          testID="light-dimmer"
        />
        <Button
          label={t('light.brighter')}
          variant="secondary"
          onPress={() => {
            changeBrightness(BRIGHTNESS_STEP);
          }}
          testID="light-brighter"
        />
      </View>

      {error !== undefined ? (
        <AppText tone="danger" accessibilityRole="alert" testID="light-error">
          {`${t('light.failed')}. ${t(errorMessageKey(error))}`}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md, marginTop: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  swatch: { width: MIN_TOUCH_TARGET, height: MIN_TOUCH_TARGET, borderRadius: radius.pill },
  input: {
    minHeight: MIN_TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
  },
});
