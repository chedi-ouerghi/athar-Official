import { sessionResponseSchema } from '@athar/contracts';
import * as SecureStore from 'expo-secure-store';
import type { SessionStorage } from './session-manager';

const KEY = 'athar.session';

/** The session in the platform keystore. Unreadable or invalid means signed out. */
export const secureSessionStorage: SessionStorage = {
  async read() {
    const raw = await SecureStore.getItemAsync(KEY);

    if (raw === null) {
      return undefined;
    }

    try {
      const parsed = sessionResponseSchema.safeParse(JSON.parse(raw));

      return parsed.success ? parsed.data : undefined;
    } catch {
      return undefined;
    }
  },
  async write(session) {
    await SecureStore.setItemAsync(KEY, JSON.stringify(session));
  },
  async clear() {
    await SecureStore.deleteItemAsync(KEY);
  },
};
