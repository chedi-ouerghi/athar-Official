import { describe, expect, it } from 'vitest';
import { describeDuration } from './format-duration';
import { translate } from './translate';

describe('describeDuration', () => {
  it('uses seconds below a minute and whole minutes from a minute up', () => {
    expect(describeDuration(45, 'en')).toStrictEqual({
      key: 'duration.seconds',
      params: { value: '45' },
    });
    expect(describeDuration(60, 'en').key).toBe('duration.minutes');
    expect(describeDuration(150, 'en').params).toStrictEqual({ value: '3' });
    expect(describeDuration(600, 'en').params).toStrictEqual({ value: '10' });
  });

  it('never says zero seconds', () => {
    expect(describeDuration(0.2, 'en').params).toStrictEqual({ value: '1' });
  });

  it('reads as an estimate in both languages', () => {
    const { key, params } = describeDuration(300, 'en');

    expect(translate('en', key, params)).toBe('About 5 min');
    expect(translate('ar', key, describeDuration(300, 'ar').params)).toMatch(/^حوالي /);
  });
});
