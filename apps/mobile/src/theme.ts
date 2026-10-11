/**
 * Design tokens for the startup shell.
 *
 * Kept in one place so that a future design system has an obvious home, and so
 * that the two colour schemes cannot drift apart.
 */

export interface Theme {
  readonly background: string;
  readonly surface: string;
  readonly border: string;
  readonly text: string;
  readonly textMuted: string;
  readonly accent: string;
  readonly success: string;
  readonly danger: string;
}

export const lightTheme: Theme = {
  background: '#F5F7FA',
  surface: '#FFFFFF',
  border: '#E2E8F0',
  text: '#0B1120',
  textMuted: '#64748B',
  accent: '#2563EB',
  success: '#15803D',
  danger: '#B91C1C',
};

export const darkTheme: Theme = {
  background: '#0B1120',
  surface: '#111827',
  border: '#1F2937',
  text: '#F8FAFC',
  textMuted: '#94A3B8',
  accent: '#60A5FA',
  success: '#4ADE80',
  danger: '#F87171',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;
