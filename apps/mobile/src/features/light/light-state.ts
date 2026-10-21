/** Brightness step of the dimmer / brighter buttons, in percent. */
export const BRIGHTNESS_STEP = 10;

/** Colours offered as one tap. Any other `#rrggbb` can be typed. */
export const SWATCHES = ['#ff3b30', '#ff9500', '#ffd60a', '#34c759', '#0a84ff', '#bf5af2'] as const;

/** `#rrggbb` in any case, or `undefined`: the same rule as the contract's `hexColorSchema`. */
export function normaliseHex(value: string): string | undefined {
  const hex = value.trim().toLowerCase();

  return /^#[0-9a-f]{6}$/.test(hex) ? hex : undefined;
}

/** Brightness moved by `delta` percent, kept inside the contract's 1 to 100. */
export function stepBrightness(current: number, delta: number): number {
  return Math.min(100, Math.max(1, current + delta));
}
