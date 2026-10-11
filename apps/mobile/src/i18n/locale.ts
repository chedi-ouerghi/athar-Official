/**
 * Pure language helpers: which language to use, which way it reads, and how to
 * pick the right text out of the API's `{ en, ar }` content.
 *
 * No React Native import, so all of it is tested in plain Node.
 */

import { localeSchema, type Locale, type LocalizedText } from '@athar/contracts';

export type { Locale };

/** Every language the app ships with. */
export const SUPPORTED_LOCALES: readonly Locale[] = localeSchema.options;

/**
 * Used when the device language is not one of ours. Which language should be the
 * default is open decision 17; English is the fallback until it is decided.
 */
export const FALLBACK_LOCALE: Locale = 'en';

/** Languages written right to left. */
const RTL_LOCALES: readonly Locale[] = ['ar'];

export function isSupportedLocale(value: unknown): value is Locale {
  return localeSchema.safeParse(value).success;
}

export function isRtlLocale(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}

/**
 * The app language for a device, given its preferred language codes in order
 * (`['ar', 'en']`, as `expo-localization` reports them). The first one the app
 * supports wins, so a device set to French then Arabic gets Arabic.
 */
export function resolveDeviceLocale(languageCodes: readonly (string | null | undefined)[]): Locale {
  for (const code of languageCodes) {
    const normalised = code?.trim().toLowerCase().split(/[-_]/)[0];

    if (isSupportedLocale(normalised)) {
      return normalised;
    }
  }

  return FALLBACK_LOCALE;
}

/**
 * Pick one language out of content that carries all of them. The API guarantees
 * both are present (both are required by the schema), so there is deliberately no
 * fallback to the other language: a missing one would be a contract violation
 * that should be seen, not hidden.
 */
export function localize(text: LocalizedText, locale: Locale): string {
  return text[locale];
}

/** A fraction (0..1) written the way the language writes percentages. */
export function formatPercent(fraction: number, locale: Locale): string {
  return new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(
    Math.min(1, Math.max(0, fraction)),
  );
}
