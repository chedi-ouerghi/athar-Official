/**
 * Layout direction, which React Native fixes when the app starts.
 *
 * `I18nManager.isRTL` is read by the native layout engine at launch. Changing it
 * with `forceRTL` is stored natively and takes effect the next time the app
 * starts, so switching between a left-to-right and a right-to-left language
 * needs a restart before the layout mirrors. The text itself switches at once.
 */

import { DevSettings, I18nManager } from 'react-native';
import { isRtlLocale, type Locale } from './locale';

/**
 * Make the next launch lay out in the direction of `locale`.
 *
 * `allowRTL` is set to the same value as `forceRTL` on purpose: with RTL allowed,
 * a device whose own language is Arabic would stay right-to-left even after the
 * user chose English.
 *
 * @returns whether the layout currently on screen has the wrong direction, i.e.
 *   a restart is needed to finish the switch.
 */
export function applyLayoutDirection(locale: Locale): { restartRequired: boolean } {
  const rtl = isRtlLocale(locale);

  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);

  return { restartRequired: I18nManager.isRTL !== rtl };
}

/**
 * Restart the app, if the platform lets JavaScript do it.
 *
 * Only development builds can (`DevSettings.reload`). A release build has no
 * restart API without `expo-updates`, which this app does not include, so the
 * caller must ask the user to reopen the app.
 *
 * @returns whether a reload was started.
 */
export function reloadApp(): boolean {
  if (__DEV__) {
    DevSettings.reload();
    return true;
  }

  return false;
}
