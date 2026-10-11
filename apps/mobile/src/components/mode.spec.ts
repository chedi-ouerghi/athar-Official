import { describe, expect, it } from 'vitest';
import { resolveDisplayMode } from './mode';

describe('resolveDisplayMode', () => {
  it('believes only the two exact values', () => {
    expect(resolveDisplayMode('simulation')).toBe('simulation');
    expect(resolveDisplayMode('hardware')).toBe('hardware');
  });

  it('fails closed for anything else', () => {
    const others = [undefined, null, '', 'Hardware', 'HARDWARE', ' hardware', 'real', 0, true, {}];

    for (const value of others) {
      expect(resolveDisplayMode(value), String(value)).toBe('unknown');
    }
  });
});
