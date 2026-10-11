import type { Locale } from './locale';
import type { TranslationKey, TranslationParams } from './translate';

/**
 * An estimated duration as a translation key and its parameters, rounded the way
 * a person says it: whole minutes from a minute up, seconds below. "About" is in
 * the string, because it is an estimate.
 *
 * Digits are written the way the language writes them (Arabic-Indic for Arabic),
 * through the platform's number formatting.
 */
export function describeDuration(
  seconds: number,
  locale: Locale,
): { key: Extract<TranslationKey, `duration.${string}`>; params: TranslationParams } {
  const format = (value: number) => new Intl.NumberFormat(locale).format(value);

  if (seconds < 60) {
    return { key: 'duration.seconds', params: { value: format(Math.max(1, Math.round(seconds))) } };
  }

  return { key: 'duration.minutes', params: { value: format(Math.round(seconds / 60)) } };
}
