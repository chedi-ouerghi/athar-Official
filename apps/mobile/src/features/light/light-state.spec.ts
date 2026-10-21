import { hexColorSchema } from '@athar/contracts';
import { describe, expect, it } from 'vitest';
import { SWATCHES, normaliseHex, stepBrightness } from './light-state';

describe('normaliseHex', () => {
  it('accepts #rrggbb in any case and trims it', () => {
    expect(normaliseHex(' #FF8800 ')).toBe('#ff8800');
  });

  it.each(['ff8800', '#ff88', '#ff88000', '#gg8800', ''])('refuses %j', (value) => {
    expect(normaliseHex(value)).toBeUndefined();
  });

  it('agrees with the contract on every swatch', () => {
    for (const swatch of SWATCHES) {
      expect(normaliseHex(swatch)).toBe(hexColorSchema.parse(swatch));
    }
  });
});

describe('stepBrightness', () => {
  it('stays between 1 and 100', () => {
    expect(stepBrightness(95, 10)).toBe(100);
    expect(stepBrightness(5, -10)).toBe(1);
    expect(stepBrightness(50, -10)).toBe(40);
  });
});
