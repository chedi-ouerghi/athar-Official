/**
 * The user's preferences (language, theme), in one small JSON file in the app's
 * own document directory (`expo-file-system`, an Expo package: no extra native
 * module). Each preference lives under its own key, and a write changes only the
 * keys it is given, so saving the theme never forgets the language.
 *
 * Absent or unreadable means "no choice yet"; a storage failure never stops the
 * app, it only costs the user one more tap on the next launch.
 */

import { File, Paths } from 'expo-file-system';

const FILE_NAME = 'athar-settings.json';

function settingsFile(): File {
  return new File(Paths.document, FILE_NAME);
}

export function readSettings(): Record<string, unknown> {
  try {
    const file = settingsFile();

    if (!file.exists) {
      return {};
    }

    const parsed: unknown = JSON.parse(file.textSync());

    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function writeSettings(patch: Record<string, unknown>): void {
  try {
    const file = settingsFile();
    const next = { ...readSettings(), ...patch };

    if (!file.exists) {
      file.create();
    }

    file.write(JSON.stringify(next));
  } catch {
    // Losing a preference is not worth interrupting the user for.
  }
}
