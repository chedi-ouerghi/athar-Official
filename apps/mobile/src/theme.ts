/**
 * Design tokens.
 *
 * Kept in one place so the two colour schemes cannot drift apart, and so a
 * component never contains a literal colour, size or font name. This module has
 * no React Native import: it is plain data, usable from tests running in Node.
 *
 * The look is calm and warm: sand for surfaces, a deep warm ink for text, and a
 * single bronze accent. Contrast of every text/background pair is asserted in
 * `theme.spec.ts`, so a colour change that makes text hard to read fails a test.
 */

export interface Theme {
  /** Screen background. */
  readonly background: string;
  /** Cards and sheets that sit on the background. */
  readonly surface: string;
  /** A quieter fill than {@link surface}, for wells and disabled controls. */
  readonly surfaceMuted: string;
  readonly border: string;
  /** Primary text. */
  readonly text: string;
  /** Secondary text. Still passes AA on {@link background} and {@link surface}. */
  readonly textMuted: string;
  /** Text and icons placed on {@link accent}. */
  readonly textOnAccent: string;
  readonly accent: string;
  /** {@link accent} while pressed. */
  readonly accentPressed: string;
  /** Tinted fill for badges and highlights. */
  readonly accentSoft: string;
  /** Text on {@link accentSoft}. */
  readonly accentText: string;
  readonly success: string;
  readonly successSoft: string;
  readonly danger: string;
  readonly dangerSoft: string;
  readonly warning: string;
  readonly warningSoft: string;
  /** A restrained highlight for ornament and rings; never used for text. */
  readonly gold: string;
  /** Centre and rim of the sand disc a design is drawn on. */
  readonly discCenter: string;
  readonly discEdge: string;
  /** Colour of drop shadows (opacity is set by the shadow token). */
  readonly shadow: string;
  /** The whole design path, before anything is drawn. */
  readonly pathFaint: string;
  /** The part of the design path drawn so far. */
  readonly pathDrawn: string;
}

export const lightTheme: Theme = {
  background: '#F6F0E4',
  surface: '#FFFBF3',
  surfaceMuted: '#EEE5D3',
  border: '#E0D4BC',
  text: '#2B2118',
  textMuted: '#665A48',
  textOnAccent: '#FFFBF3',
  accent: '#8C5A2B',
  accentPressed: '#734A23',
  accentSoft: '#EFDFC6',
  accentText: '#6F4520',
  success: '#3F6B3A',
  successSoft: '#E1ECD8',
  danger: '#A63A2B',
  dangerSoft: '#F6DDD6',
  warning: '#7A5206',
  warningSoft: '#F5E6BF',
  gold: '#B58A3C',
  discCenter: '#FFFDF8',
  discEdge: '#EBDDC3',
  shadow: '#3A2A14',
  pathFaint: '#AE9A74',
  pathDrawn: '#5A3A1C',
};

export const darkTheme: Theme = {
  background: '#16120D',
  surface: '#1F1912',
  surfaceMuted: '#2A2218',
  border: '#3B3123',
  text: '#F1E9DA',
  textMuted: '#B3A58F',
  textOnAccent: '#1B130A',
  accent: '#D8A25E',
  accentPressed: '#C28D4B',
  accentSoft: '#3A2C18',
  accentText: '#E8C48A',
  success: '#8FBF86',
  successSoft: '#243322',
  danger: '#E88A78',
  dangerSoft: '#3A211C',
  warning: '#E3B650',
  warningSoft: '#3A2E12',
  gold: '#E0B866',
  discCenter: '#34291B',
  discEdge: '#1A140D',
  shadow: '#000000',
  pathFaint: '#6A5A42',
  pathDrawn: '#F0CF98',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 22,
  xl: 30,
  /** Fully rounded ends, for badges. */
  pill: 999,
} as const;

/**
 * Elevation. Soft, wide and low-opacity: a card should look lifted off the sand,
 * not stuck on it. `elevation` is the Android equivalent (it ignores colour).
 */
export const shadows = {
  soft: {
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  lifted: {
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
} as const;

/** Smallest comfortable touch target, in density-independent pixels. */
export const MIN_TOUCH_TARGET = 48;

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

/**
 * IBM Plex Sans Arabic: one family that carries both Arabic and Latin glyphs, so
 * mixed text (a Latin table name inside an Arabic sentence) keeps one voice
 * instead of falling back to a system font. SIL Open Font License 1.1.
 *
 * One entry per weight, because Android ignores `fontWeight` for a custom
 * family. The names are the keys the fonts are registered under in
 * `src/fonts.ts`.
 */
export const fontFamily = {
  regular: 'IBMPlexSansArabic_400Regular',
  medium: 'IBMPlexSansArabic_500Medium',
  semibold: 'IBMPlexSansArabic_600SemiBold',
  bold: 'IBMPlexSansArabic_700Bold',
} as const;

export type TextVariant =
  'hero' | 'display' | 'title' | 'heading' | 'body' | 'bodyStrong' | 'label' | 'caption';

export interface TypographyStyle {
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly lineHeight: number;
}

/**
 * No `letterSpacing` and no `textTransform` anywhere: positive tracking breaks
 * the joins between Arabic letters. Line heights are generous (about 1.5 or more)
 * because Arabic ascenders and marks need the room.
 */
export const typography: Readonly<Record<TextVariant, TypographyStyle>> = {
  hero: { fontFamily: fontFamily.bold, fontSize: 44, lineHeight: 68 },
  display: { fontFamily: fontFamily.bold, fontSize: 36, lineHeight: 54 },
  title: { fontFamily: fontFamily.semibold, fontSize: 24, lineHeight: 36 },
  heading: { fontFamily: fontFamily.semibold, fontSize: 18, lineHeight: 28 },
  body: { fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 26 },
  bodyStrong: { fontFamily: fontFamily.medium, fontSize: 16, lineHeight: 26 },
  label: { fontFamily: fontFamily.medium, fontSize: 14, lineHeight: 22 },
  caption: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 20 },
};
