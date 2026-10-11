import { describe, expect, it } from 'vitest';
import { ar } from './ar';
import { en } from './en';
import {
  FALLBACK_LOCALE,
  formatPercent,
  isRtlLocale,
  localize,
  resolveDeviceLocale,
} from './locale';
import { translate, type TranslationKey } from './translate';

const keys = Object.keys(en) as TranslationKey[];

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '').sort();
}

describe('translation files', () => {
  it('define exactly the same keys in both languages', () => {
    expect(Object.keys(ar).sort()).toStrictEqual([...keys].sort());
  });

  it('have no empty strings', () => {
    for (const key of keys) {
      expect(en[key].trim(), `en ${key}`).not.toBe('');
      expect(ar[key].trim(), `ar ${key}`).not.toBe('');
    }
  });

  it('use the same placeholders in both languages', () => {
    for (const key of keys) {
      expect(placeholders(ar[key]), key).toStrictEqual(placeholders(en[key]));
    }
  });

  it('write Arabic in Arabic script (except the English language name)', () => {
    for (const key of keys) {
      if (key === 'language.en') continue;
      expect(ar[key], key).toMatch(/[؀-ۿ]/);
    }
  });

  it('keep technical words out of every error message, in both languages', () => {
    const technical =
      /\b(api|server|http|https|request|network|timeout|timed out|json|endpoint|backend|status|exception|null|undefined)\b|\b[45]\d\d\b/i;

    for (const key of keys.filter((candidate) => candidate.startsWith('error.'))) {
      expect(en[key], key).not.toMatch(technical);
      // Latin letters in an Arabic message would be an untranslated technical term.
      expect(ar[key], key).not.toMatch(/[A-Za-z]/);
    }
  });
});

describe('translate', () => {
  it('fills placeholders', () => {
    expect(translate('en', 'designPreview.labelWithProgress', { percent: '40%' })).toBe(
      'Design preview, 40% drawn',
    );
  });

  it('throws when a placeholder has no value, instead of showing it', () => {
    expect(() => translate('en', 'designPreview.labelWithProgress')).toThrow(/percent/);
  });

  it('returns the string of the requested language', () => {
    expect(translate('ar', 'mode.simulation')).toBe(ar['mode.simulation']);
    expect(translate('en', 'mode.simulation')).toBe('Simulation');
  });
});

describe('resolveDeviceLocale', () => {
  it('uses the first supported language the device lists', () => {
    expect(resolveDeviceLocale(['fr', 'ar', 'en'])).toBe('ar');
    expect(resolveDeviceLocale(['en'])).toBe('en');
  });

  it('understands region tags and case', () => {
    expect(resolveDeviceLocale(['AR-EG'])).toBe('ar');
    expect(resolveDeviceLocale(['en_GB'])).toBe('en');
  });

  it('falls back when nothing is supported', () => {
    expect(resolveDeviceLocale(['fr', 'de', null, undefined])).toBe(FALLBACK_LOCALE);
    expect(resolveDeviceLocale([])).toBe(FALLBACK_LOCALE);
  });
});

describe('locale helpers', () => {
  it('marks only Arabic as right to left', () => {
    expect(isRtlLocale('ar')).toBe(true);
    expect(isRtlLocale('en')).toBe(false);
  });

  it('picks the requested language of API content, with no silent fallback', () => {
    expect(localize({ en: 'Dunes', ar: 'كثبان' }, 'ar')).toBe('كثبان');
    expect(localize({ en: 'Dunes', ar: 'كثبان' }, 'en')).toBe('Dunes');
  });

  it('formats and clamps percentages', () => {
    expect(formatPercent(0.5, 'en')).toBe('50%');
    expect(formatPercent(7, 'en')).toBe('100%');
    expect(formatPercent(-1, 'en')).toBe('0%');
  });
});
