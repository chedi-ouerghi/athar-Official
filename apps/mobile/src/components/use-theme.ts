import { useColorScheme } from 'react-native';
import { darkTheme, lightTheme, type Theme } from '../theme';

/** The colours for the device's light or dark setting. */
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme;
}
