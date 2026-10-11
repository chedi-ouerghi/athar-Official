/**
 * Remembers the language the user chose, in a one-line JSON file in the app's
 * own document directory (`expo-file-system`, an Expo package: no extra native
 * module). Absent or unreadable means "no choice yet", so the device language is
 * used; a storage failure never stops the app.
 */

import { File, Paths } from 'expo-file-system';
import { isSupportedLocale, type Locale } from './locale';

const FILE_NAME = 'athar-settings.json';

function settingsFile(): File {
  return new File(Paths.document, FILE_NAME);
}

export function readStoredLocale(): Locale | undefined {
  try {
    const file = settingsFile();

    if (!file.exists) {
      return undefined;
    }

    const parsed: unknown = JSON.parse(file.textSync());
    const locale = (parsed as { locale?: unknown } | null)?.locale;

    return isSupportedLocale(locale) ? locale : undefined;
  } catch {
    return undefined;
  }
}

export function storeLocale(locale: Locale): void {
  try {
    const file = settingsFile();

    if (!file.exists) {
      file.create();
    }

    file.write(JSON.stringify({ locale }));
  } catch {
    // Losing the preference costs one more tap next launch; it is not an error
    // worth interrupting the user for.
  }
}
