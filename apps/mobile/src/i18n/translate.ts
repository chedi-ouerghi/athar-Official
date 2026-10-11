import { ar } from './ar';
import { en, type TranslationKey } from './en';
import type { Locale } from './locale';

export type { TranslationKey };

export type TranslationParams = Readonly<Record<string, string | number>>;

export const TRANSLATIONS: Readonly<Record<Locale, Readonly<Record<TranslationKey, string>>>> = {
  en,
  ar,
};

/**
 * Look a string up and fill its `{placeholders}`.
 *
 * `key` is typed, so a key that does not exist is a compile error rather than a
 * raw key on screen. A placeholder with no value throws: it means the caller and
 * the translation disagree, which a test should catch.
 */
export function translate(
  locale: Locale,
  key: TranslationKey,
  params: TranslationParams = {},
): string {
  return TRANSLATIONS[locale][key].replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = params[name];

    if (value === undefined) {
      throw new Error(`Missing value for "{${name}}" in translation "${key}".`);
    }

    return String(value);
  });
}
