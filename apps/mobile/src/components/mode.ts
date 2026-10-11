import type { TranslationKey } from '../i18n/en';

export type DisplayMode = 'simulation' | 'hardware' | 'unknown';

/**
 * What to tell the user about a table's or job's mode. **Fail-closed**: only the
 * exact strings the contract defines are believed. A missing, misspelt or future
 * value is `unknown`, never silently "real" and never nothing at all, so a
 * simulated drawing can never be presented as a physical one by accident.
 */
export function resolveDisplayMode(mode: unknown): DisplayMode {
  if (mode === 'simulation') return 'simulation';
  if (mode === 'hardware') return 'hardware';
  return 'unknown';
}

export const MODE_LABEL_KEY: Readonly<Record<DisplayMode, TranslationKey>> = {
  simulation: 'mode.simulation',
  hardware: 'mode.hardware',
  unknown: 'mode.unknown',
};
