import * as Localization from 'expo-localization';
import { useCallback, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import { I18nContext, createI18n } from './context';
import { applyLayoutDirection, reloadApp } from './direction';
import { readStoredLocale, storeLocale } from './language-storage';
import { resolveDeviceLocale, type Locale } from './locale';

/** The stored choice if there is one, otherwise the device language. */
function initialLocale(): Locale {
  return (
    readStoredLocale() ??
    resolveDeviceLocale(Localization.getLocales().map((entry) => entry.languageCode))
  );
}

export function I18nProvider({ children }: { readonly children: ReactNode }): ReactElement {
  const [state, setState] = useState(() => {
    const locale = initialLocale();
    // Also covers a first launch where the stored choice and the native layout
    // disagree, e.g. after an interrupted switch.
    return { locale, restartRequired: applyLayoutDirection(locale).restartRequired };
  });

  const setLocale = useCallback((next: Locale) => {
    storeLocale(next);
    const { restartRequired } = applyLayoutDirection(next);

    setState({ locale: next, restartRequired });

    if (restartRequired) {
      reloadApp();
    }
  }, []);

  const value = useMemo(
    () => createI18n(state.locale, setLocale, state.restartRequired),
    [state, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
