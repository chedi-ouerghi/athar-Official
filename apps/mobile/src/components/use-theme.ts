import { useColorScheme } from 'react-native';
import { darkTheme, lightTheme, type Theme } from '../theme';
import { useThemePreference } from './theme-preference';

/** Whether the app is showing its dark look: the user's choice, else the phone's setting. */
export function useIsDark(): boolean {
  const system = useColorScheme();
  const { preference } = useThemePreference();

  return preference === 'system' ? system === 'dark' : preference === 'dark';
}

/** The colours for the look in use. */
export function useTheme(): Theme {
  return useIsDark() ? darkTheme : lightTheme;
}
