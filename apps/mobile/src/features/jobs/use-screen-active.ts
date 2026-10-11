import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { isScreenActive } from './polling';

/**
 * True while this screen is focused and the app is in the foreground. Polling
 * follows it: nothing is fetched for a screen nobody can see.
 */
export function useScreenActive(): boolean {
  const [focused, setFocused] = useState(false);
  const [appState, setAppState] = useState<string>(AppState.currentState);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);

      return () => {
        setFocused(false);
      };
    }, []),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);

    return () => {
      subscription.remove();
    };
  }, []);

  return isScreenActive(focused, appState);
}
