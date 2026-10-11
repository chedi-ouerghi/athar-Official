import { render, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { ApiClientProvider } from './api/api-client-context';
import type { AtharApiClient } from './api/athar-api-client';
import { I18nContext, createI18n } from './i18n/context';
import type { Locale } from './i18n/locale';

/** Render a component with the app's language context, without any device module. */
export function renderWithI18n(
  ui: ReactElement,
  { locale = 'en', ...options }: { locale?: Locale } & RenderOptions = {},
): ReturnType<typeof render> {
  const value = createI18n(locale, () => undefined);

  return render(ui, {
    ...options,
    wrapper: ({ children }: { children: ReactNode }) => (
      <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
    ),
  });
}

/** The client methods a stub can answer. */
type ClientMethod =
  | 'getTable'
  | 'listDesigns'
  | 'getDesign'
  | 'startJob'
  | 'getJob'
  | 'pauseJob'
  | 'resumeJob'
  | 'stopJob'
  | 'listJobs';

/** A client that answers only what a test defines; anything else fails loudly. */
export function stubClient(
  methods: Partial<Record<ClientMethod, (...args: never[]) => Promise<unknown>>>,
): AtharApiClient {
  return new Proxy(
    {},
    {
      get: (_target, name: string) =>
        methods[name as ClientMethod] ??
        (() => Promise.reject(new Error(`Unexpected client call: ${name}`))),
    },
  ) as AtharApiClient;
}

/** The wrapper for hooks and screens that talk to the API. */
export function appWrapper(
  client: AtharApiClient,
  locale: Locale = 'en',
): ({ children }: { children: ReactNode }) => ReactElement {
  const value = createI18n(locale, () => undefined);

  return function Wrapper({ children }: { children: ReactNode }): ReactElement {
    return (
      <I18nContext.Provider value={value}>
        <ApiClientProvider client={client}>{children}</ApiClientProvider>
      </I18nContext.Provider>
    );
  };
}

/** Render a screen with a language and an API client. */
export function renderWithApp(
  ui: ReactElement,
  client: AtharApiClient,
  locale: Locale = 'en',
): ReturnType<typeof render> {
  return render(ui, { wrapper: appWrapper(client, locale) });
}
