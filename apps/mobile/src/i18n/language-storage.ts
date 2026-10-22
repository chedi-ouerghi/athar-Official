/**
 * Remembers the language the user chose, in the shared settings file. Absent or
 * unreadable means "no choice yet", so the device language is used.
 */

import { readSettings, writeSettings } from '../settings/settings-storage';
import { isSupportedLocale, type Locale } from './locale';

export function readStoredLocale(): Locale | undefined {
  const locale = readSettings().locale;

  return isSupportedLocale(locale) ? locale : undefined;
}

export function storeLocale(locale: Locale): void {
  writeSettings({ locale });
}
