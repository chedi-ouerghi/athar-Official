/**
 * The i18n context, kept apart from the provider so that components (and their
 * tests) can use it without pulling in the device modules the provider needs.
 */

import { createContext, useContext } from 'react';
import { formatPercent, isRtlLocale, type Locale } from './locale';
import { translate, type TranslationKey, type TranslationParams } from './translate';

export interface I18n {
  readonly locale: Locale;
  readonly isRtl: boolean;
  /** Translate a key into the current language. */
  readonly t: (key: TranslationKey, params?: TranslationParams) => string;
  /** A 0..1 fraction as a percentage in the current language. */
  readonly percent: (fraction: number) => string;
  /** Switch language. The text changes at once; the layout may need a restart. */
  readonly setLocale: (locale: Locale) => void;
  /** True when the layout direction is wrong for the language until the app restarts. */
  readonly restartRequired: boolean;
}

export const I18nContext = createContext<I18n | null>(null);

export function createI18n(
  locale: Locale,
  setLocale: (locale: Locale) => void,
  restartRequired = false,
): I18n {
  return {
    locale,
    isRtl: isRtlLocale(locale),
    t: (key, params) => translate(locale, key, params),
    percent: (fraction) => formatPercent(fraction, locale),
    setLocale,
    restartRequired,
  };
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);

  if (value === null) {
    throw new Error('useI18n must be used inside an I18nProvider.');
  }

  return value;
}
