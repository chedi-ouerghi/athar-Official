import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { readSettings, writeSettings } from '../settings/settings-storage';

/** What the user chose: follow the phone, or force one look. */
export type ThemePreference = 'system' | 'light' | 'dark';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

interface ThemePreferenceValue {
  readonly preference: ThemePreference;
  readonly setPreference: (next: ThemePreference) => void;
}

const ThemePreferenceContext = createContext<ThemePreferenceValue | null>(null);

function isThemePreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference);
}

function readStoredPreference(): ThemePreference {
  const stored = readSettings().theme;

  // The brand is dark (obsidian and gold, like the website): that is how it first opens,
  // until the user picks otherwise in the account tab.
  return isThemePreference(stored) ? stored : 'dark';
}

/** Holds the chosen look for the whole app, and remembers it between launches. */
export function ThemePreferenceProvider({
  children,
}: {
  readonly children: ReactNode;
}): ReactElement {
  const [preference, setState] = useState<ThemePreference>(readStoredPreference);

  const setPreference = useCallback((next: ThemePreference) => {
    setState(next);
    writeSettings({ theme: next });
  }, []);

  const value = useMemo(() => ({ preference, setPreference }), [preference, setPreference]);

  return (
    <ThemePreferenceContext.Provider value={value}>{children}</ThemePreferenceContext.Provider>
  );
}

/**
 * The chosen look. Outside a provider (a component test, say) it is `system` and
 * choosing does nothing, so a component never needs the provider to render.
 */
export function useThemePreference(): ThemePreferenceValue {
  return (
    useContext(ThemePreferenceContext) ?? { preference: 'system', setPreference: () => undefined }
  );
}
