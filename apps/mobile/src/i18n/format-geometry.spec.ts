import { describe, expect, it } from 'vitest';
import { describeGeometry } from './format-geometry';
import { translate } from './translate';

describe('describeGeometry', () => {
  it.each([
    [{ shape: 'round', widthMm: 800, heightMm: 800 }, 'Round table, 800 mm across'],
    [{ shape: 'square', widthMm: 700, heightMm: 700 }, 'Square table, 700 mm'],
    [{ shape: 'rectangle', widthMm: 1200, heightMm: 800 }, 'Rectangular table, 1,200 × 800 mm'],
    [{ shape: 'oval', widthMm: 1500, heightMm: 900 }, 'Oval table, 1,500 × 900 mm'],
  ] as const)('says %j in English', (geometry, sentence) => {
    const { key, params } = describeGeometry(geometry, 'en');

    expect(translate('en', key, params)).toBe(sentence);
  });

  it('gives X (the width) before Y (the height)', () => {
    const { params } = describeGeometry({ shape: 'rectangle', widthMm: 1200, heightMm: 800 }, 'en');

    expect(Object.keys(params)).toStrictEqual(['width', 'height']);
  });

  it('says every shape in Arabic, with the number formatted by the locale and nothing left unfilled', () => {
    // Whether that is Arabic-Indic or Western digits is the platform's decision.
    const width = new Intl.NumberFormat('ar').format(1200);

    for (const shape of ['round', 'square', 'rectangle', 'oval'] as const) {
      const { key, params } = describeGeometry({ shape, widthMm: 1200, heightMm: 800 }, 'ar');
      const sentence = translate('ar', key, params);

      expect(sentence).not.toMatch(/[{}]/);
      expect(sentence).toContain(width);
    }
  });
});
