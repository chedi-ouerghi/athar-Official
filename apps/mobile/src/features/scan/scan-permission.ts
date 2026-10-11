/** What the scanner screen shows, from the camera permission. */
export type ScanView =
  /** The permission state is not known yet. */
  | 'checking'
  /** Not decided: explain why the camera is needed, then ask. */
  | 'ask'
  /** Refused: offer the typed code instead (and a way to reconsider). */
  | 'denied'
  | 'granted';

/** The part of expo-camera's permission response the screen depends on. */
export interface PermissionLike {
  readonly granted: boolean;
  readonly status: string;
  readonly canAskAgain: boolean;
}

export function classifyScanView(permission: PermissionLike | null): ScanView {
  if (permission === null) return 'checking';
  if (permission.granted) return 'granted';
  if (permission.status === 'denied') return 'denied';
  return 'ask';
}
