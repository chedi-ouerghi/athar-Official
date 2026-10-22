/**
 * Design tokens.
 *
 * Kept in one place so the two colour schemes cannot drift apart, and so a
 * component never contains a literal colour, size or font name. This module has
 * no React Native import: it is plain data, usable from tests running in Node.
 *
 * The look is quiet luxury. Dark is obsidian with champagne gold; light is ivory
 * with deep bronze. Gold is the only accent, and it is rationed: the primary
 * action, the active tab, the progress ring. Contrast of every text/background
 * pair is asserted in `theme.spec.ts`, so a colour change that makes text hard to
 * read fails a test.
 */

export interface Theme {
  /** Screen background. */
  readonly background: string;
  /** Cards and sheets that sit on the background. */
  readonly surface: string;
  /** A card that sits on a {@link surface}, or a floating bar. One step lighter in dark. */
  readonly surfaceElevated: string;
  /** A quieter fill than {@link surface}, for wells and disabled controls. */
  readonly surfaceMuted: string;
  readonly border: string;
  /** Primary text. */
  readonly text: string;
  /** Secondary text. Still passes AA on {@link background} and {@link surface}. */
  readonly textMuted: string;
  /** Text and icons placed on {@link accent} or on the accent gradient. */
  readonly textOnAccent: string;
  readonly accent: string;
  /** {@link accent} while pressed. */
  readonly accentPressed: string;
  /** Tinted fill for badges and highlights. */
  readonly accentSoft: string;
  /** Text on {@link accentSoft}. */
  readonly accentText: string;
  /** The gold gradient on primary buttons and the scan key: light, middle (55%), deep. */
  readonly gradientStart: string;
  readonly gradientMid: string;
  readonly gradientEnd: string;
  readonly success: string;
  readonly successSoft: string;
  readonly danger: string;
  readonly dangerSoft: string;
  readonly warning: string;
  readonly warningSoft: string;
  /** A restrained highlight for ornament and rings; never used for text. */
  readonly gold: string;
  /** The colour of the soft light behind hero areas (drawn at low opacity). */
  readonly glow: string;
  /** The floating tab bar. */
  readonly tabBar: string;
  /** Behind a modal sheet (drawn at partial opacity). */
  readonly scrim: string;
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

/** Ivory and deep bronze. */
export const lightTheme: Theme = {
  background: '#F8F3EA',
  surface: '#FFFDF8',
  surfaceElevated: '#FFFFFF',
  surfaceMuted: '#EFE7D8',
  border: '#E3D8C3',
  text: '#1F1913',
  textMuted: '#62564A',
  textOnAccent: '#FFFBF3',
  accent: '#7C4F1F',
  accentPressed: '#653F18',
  accentSoft: '#F1E3CB',
  accentText: '#6A4119',
  gradientStart: '#946428',
  gradientMid: '#80531F',
  gradientEnd: '#6A4119',
  success: '#3F6B3A',
  successSoft: '#E1ECD8',
  danger: '#A63A2B',
  dangerSoft: '#F6DDD6',
  warning: '#7A5206',
  warningSoft: '#F5E6BF',
  gold: '#B08536',
  glow: '#D9B26B',
  tabBar: '#FFFDF8',
  scrim: '#1F1913',
  discCenter: '#FFFDF8',
  discEdge: '#EBDDC3',
  shadow: '#3A2A14',
  pathFaint: '#AE9A74',
  pathDrawn: '#5A3A1C',
};

/**
 * Obsidian and champagne gold, the values of the ATHAR website: its near-black
 * `#0c0b0a`, its warm paper text `#ece4d6`, and the three-stop champagne gradient of
 * its call to action.
 */
export const darkTheme: Theme = {
  background: '#0C0B0A',
  surface: '#141210',
  surfaceElevated: '#1B1815',
  surfaceMuted: '#221E1A',
  border: '#2D2822',
  text: '#ECE4D6',
  textMuted: '#A99F8F',
  textOnAccent: '#1B1814',
  accent: '#D99A55',
  accentPressed: '#B87A41',
  accentSoft: '#2A2016',
  accentText: '#F1C890',
  gradientStart: '#F1C890',
  gradientMid: '#D99A55',
  gradientEnd: '#B87A41',
  success: '#8FC48A',
  successSoft: '#1F2E1E',
  danger: '#EE8F7C',
  dangerSoft: '#3A1F1A',
  warning: '#E6BA55',
  warningSoft: '#3A2D10',
  gold: '#E0AE70',
  glow: '#D99A55',
  tabBar: '#15120F',
  scrim: '#000000',
  discCenter: '#2A2117',
  discEdge: '#110E0B',
  shadow: '#000000',
  pathFaint: '#6F6049',
  pathDrawn: '#F1C890',
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
 * Elevation. Soft, wide and low-opacity: a card should look lifted off the
 * surface, not stuck on it. `elevation` is the Android equivalent (it ignores
 * colour). `glow` is a gold-tinted lift for the one thing that is the point of the
 * screen (set `shadowColor` to the theme's `glow`).
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
  glow: {
    shadowOpacity: 0.35,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
} as const;

/** Smallest comfortable touch target, in density-independent pixels. */
export const MIN_TOUCH_TARGET = 48;

/** The floating tab bar, and how far the scan key rises above it. */
export const TAB_BAR_HEIGHT = 68;
export const TAB_BAR_RAISE = 18;
/**
 * Room a tab screen leaves at the bottom of its content so the last item can
 * scroll clear of the bar: the bar, its raised key, its gap to the edge, and a
 * generous home-indicator inset.
 */
export const TAB_BAR_CLEARANCE = TAB_BAR_HEIGHT + TAB_BAR_RAISE + 12 + 34;

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

/**
 * One set of timings so every screen moves at the same pace. Durations are in ms;
 * springs are `Animated.spring` configs (all run on the native driver).
 */
export const motion = {
  fast: 160,
  base: 280,
  slow: 520,
  /** Between the items of a list entering one after another. */
  stagger: 70,
  /** Rise of an entering element, in px. Vertical only, so it reads the same in both directions. */
  rise: 18,
  /** A press: quick down, slightly bouncy back. */
  pressSpring: { stiffness: 380, damping: 22, mass: 0.7 },
  /** Things that settle into place: the tab indicator, a sheet. */
  settleSpring: { stiffness: 220, damping: 20, mass: 0.9 },
} as const;

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
  light: 'IBMPlexSansArabic_300Light',
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
  display: { fontFamily: fontFamily.bold, fontSize: 34, lineHeight: 52 },
  title: { fontFamily: fontFamily.semibold, fontSize: 24, lineHeight: 36 },
  heading: { fontFamily: fontFamily.semibold, fontSize: 18, lineHeight: 28 },
  // Light, as on the website: reading text stays airy. Strong and small text keep their weight.
  body: { fontFamily: fontFamily.light, fontSize: 16, lineHeight: 26 },
  bodyStrong: { fontFamily: fontFamily.medium, fontSize: 16, lineHeight: 26 },
  label: { fontFamily: fontFamily.medium, fontSize: 14, lineHeight: 22 },
  caption: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 20 },
};

/** The serif of the website's headlines (Latin only: Arabic keeps IBM Plex Sans Arabic). */
export const serifFamily = {
  regular: 'InstrumentSerif_400Regular',
  italic: 'InstrumentSerif_400Regular_Italic',
} as const;

/**
 * Editorial headlines in Latin script: Instrument Serif, set in capitals with tight
 * tracking and tight leading, as on the website. Kept out of `typography` on
 * purpose: that table is for text that must work in Arabic (no tracking, generous
 * leading), and the component only reaches for this one when the text is Latin.
 */
export const editorial = {
  hero: { fontFamily: serifFamily.regular, fontSize: 58, lineHeight: 60, letterSpacing: -0.9 },
  display: { fontFamily: serifFamily.regular, fontSize: 42, lineHeight: 44, letterSpacing: -0.6 },
  title: { fontFamily: serifFamily.regular, fontSize: 30, lineHeight: 34, letterSpacing: -0.3 },
} as const;

/** The small tracked capitals above a headline: 11px, +2.2 tracking, medium weight. */
export const EYEBROW_TRACKING = 2.2;
