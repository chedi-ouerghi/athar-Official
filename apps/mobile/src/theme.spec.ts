import { describe, expect, it } from 'vitest';
import { darkTheme, lightTheme, typography, type Theme } from './theme';

function luminance(hex: string): number {
  const [r = 0, g = 0, b = 0] = [1, 3, 5]
    .map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [high = 0, low = 0] = [luminance(a), luminance(b)].sort((x, y) => y - x);

  return (high + 0.05) / (low + 0.05);
}

const AA = 4.5;

describe.each([
  ['light', lightTheme],
  ['dark', darkTheme],
] as const)('%s theme', (_name, theme: Theme) => {
  it('has the same tokens as the other scheme, all 6-digit hex colours', () => {
    expect(Object.keys(theme).sort()).toStrictEqual(Object.keys(lightTheme).sort());

    for (const value of Object.values(theme)) {
      expect(value).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('keeps text readable (WCAG AA) on every surface it is placed on', () => {
    const pairs: [string, string][] = [
      [theme.text, theme.background],
      [theme.text, theme.surface],
      [theme.textMuted, theme.background],
      [theme.textMuted, theme.surface],
      [theme.textOnAccent, theme.accent],
      [theme.textOnAccent, theme.accentPressed],
      [theme.accentText, theme.accentSoft],
      [theme.success, theme.successSoft],
      [theme.danger, theme.dangerSoft],
      [theme.warning, theme.warningSoft],
      [theme.danger, theme.background],
      [theme.accentText, theme.background],
    ];

    for (const [foreground, background] of pairs) {
      expect(
        contrast(foreground, background),
        `${foreground} on ${background}`,
      ).toBeGreaterThanOrEqual(AA);
    }
  });

  it('keeps a design legible on the sand disc it is drawn on', () => {
    for (const disc of [theme.discCenter, theme.discEdge]) {
      expect(contrast(theme.pathDrawn, disc)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(theme.pathFaint, disc)).toBeGreaterThanOrEqual(1.8);
    }
  });

  it('shows the drawn part of a path clearly against the faint whole', () => {
    expect(contrast(theme.pathDrawn, theme.surface)).toBeGreaterThanOrEqual(3);
    expect(contrast(theme.pathDrawn, theme.pathFaint)).toBeGreaterThanOrEqual(3);
  });
});

describe('typography', () => {
  it('leaves generous line height and never uses letter spacing (it breaks Arabic joins)', () => {
    for (const style of Object.values(typography)) {
      expect(style.lineHeight / style.fontSize).toBeGreaterThanOrEqual(1.5);
      expect(style).not.toHaveProperty('letterSpacing');
    }
  });
});
