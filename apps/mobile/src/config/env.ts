/**
 * Centralised, validated runtime configuration for the mobile app.
 *
 * Design constraints:
 *
 * - The API address is never embedded in the source. It comes from
 *   configuration, and a platform-appropriate default is derived only when
 *   nothing was configured explicitly.
 * - `localhost` is *not* a universal answer: an Android emulator reaches the
 *   host machine through `10.0.2.2`, an iOS simulator through `localhost`, and
 *   a physical device through the host's LAN address.
 * - Only `EXPO_PUBLIC_*` variables exist here. Those are inlined into the
 *   JavaScript bundle, so they are public by construction and must never hold
 *   a secret.
 */

import { z } from 'zod';

/** Runtime platform, as reported by React Native. */
export type PlatformName = 'android' | 'ios' | 'web' | (string & {});

/**
 * Host that maps back to the developer machine for each platform.
 *
 * - `android`: the emulator's built-in alias for the host loopback interface.
 * - `ios` / `web`: the host loopback interface is reachable directly.
 *
 * A physical device is not represented here on purpose: no loopback alias
 * exists for it, so `EXPO_PUBLIC_API_BASE_URL` must be set explicitly.
 */
const PLATFORM_LOOPBACK_HOSTS: Readonly<Record<string, string>> = {
  android: '10.0.2.2',
  ios: 'localhost',
  web: 'localhost',
};

/** Loopback alias used when the platform is not recognised. */
const FALLBACK_LOOPBACK_HOST = 'localhost';

/**
 * Normalises a possibly-absent base URL.
 *
 * An unset or blank variable is equivalent to "not configured": the app then
 * derives a platform-appropriate address from {@link apiPort}.
 */
const optionalBaseUrl = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value === undefined || value.length === 0 ? undefined : value))
  .pipe(z.union([z.url(), z.undefined()]));

const rawEnvironmentSchema = z.object({
  /** Explicit API origin, e.g. `http://192.168.1.20:3000`. */
  apiBaseUrl: optionalBaseUrl,

  /** Port used when deriving the default base URL. */
  apiPort: z.coerce.number().int().min(1).max(65535).default(3000),

  /** Per-request network timeout. */
  apiTimeoutMs: z.coerce.number().int().positive().default(10_000),
});

/** Unvalidated configuration read from the build environment. */
export interface RawEnvironment {
  readonly EXPO_PUBLIC_API_BASE_URL?: string | undefined;
  readonly EXPO_PUBLIC_API_PORT?: string | undefined;
  readonly EXPO_PUBLIC_API_TIMEOUT_MS?: string | undefined;
}

/** How the effective API base URL was determined. */
export type ApiBaseUrlSource = 'configured' | 'platform-default';

/** Fully resolved configuration consumed by the application. */
export interface AppEnvironment {
  /** Origin of the API, without a trailing slash, e.g. `http://10.0.2.2:3000`. */
  readonly apiBaseUrl: string;
  /** Whether {@link apiBaseUrl} was configured or derived from the platform. */
  readonly apiBaseUrlSource: ApiBaseUrlSource;
  /** Network timeout applied to every API request. */
  readonly apiTimeoutMs: number;
}

/**
 * Raised when the build environment does not produce usable configuration.
 *
 * Failing loudly at startup is preferable to an app that silently points at
 * the wrong host.
 */
export class EnvironmentConfigurationError extends Error {
  constructor(readonly issues: readonly string[]) {
    super(`Invalid mobile configuration:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'EnvironmentConfigurationError';
  }
}

/** Read the raw configuration from an environment-like source. */
export function readRawEnvironment(
  source: RawEnvironment = process.env as RawEnvironment,
): RawEnvironment {
  return {
    EXPO_PUBLIC_API_BASE_URL: source.EXPO_PUBLIC_API_BASE_URL,
    EXPO_PUBLIC_API_PORT: source.EXPO_PUBLIC_API_PORT,
    EXPO_PUBLIC_API_TIMEOUT_MS: source.EXPO_PUBLIC_API_TIMEOUT_MS,
  };
}

/**
 * Derive the loopback address of the developer machine for a platform.
 *
 * Exported separately so the mapping can be asserted directly in tests.
 */
export function resolveLoopbackHost(platform: PlatformName): string {
  return PLATFORM_LOOPBACK_HOSTS[platform] ?? FALLBACK_LOOPBACK_HOST;
}

/**
 * Join an origin and a path into an absolute URL with exactly one separator.
 */
export function joinUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

/**
 * Resolve the effective API base URL for a platform.
 *
 * A configured URL always wins. Otherwise a loopback address is derived from
 * the configured port using the alias that is correct for that platform.
 */
export function resolveApiBaseUrl(
  configuredBaseUrl: string | undefined,
  platform: PlatformName,
  port: number,
): { apiBaseUrl: string; apiBaseUrlSource: ApiBaseUrlSource } {
  if (configuredBaseUrl !== undefined) {
    return { apiBaseUrl: configuredBaseUrl.replace(/\/+$/, ''), apiBaseUrlSource: 'configured' };
  }

  return {
    apiBaseUrl: `http://${resolveLoopbackHost(platform)}:${port}`,
    apiBaseUrlSource: 'platform-default',
  };
}

/**
 * Validate a raw environment and resolve it into {@link AppEnvironment}.
 *
 * @throws EnvironmentConfigurationError when a value is present but unusable.
 */
export function createAppEnvironment(raw: RawEnvironment, platform: PlatformName): AppEnvironment {
  const parsed = rawEnvironmentSchema.safeParse({
    apiBaseUrl: raw.EXPO_PUBLIC_API_BASE_URL,
    apiPort: raw.EXPO_PUBLIC_API_PORT,
    apiTimeoutMs: raw.EXPO_PUBLIC_API_TIMEOUT_MS,
  });

  if (!parsed.success) {
    throw new EnvironmentConfigurationError(
      parsed.error.issues.map((issue) => {
        const key = issue.path.join('.');
        const variable =
          key === 'apiBaseUrl'
            ? 'EXPO_PUBLIC_API_BASE_URL'
            : key === 'apiPort'
              ? 'EXPO_PUBLIC_API_PORT'
              : 'EXPO_PUBLIC_API_TIMEOUT_MS';
        return `${variable}: ${issue.message}`;
      }),
    );
  }

  const { apiBaseUrl: configured, apiPort, apiTimeoutMs } = parsed.data;

  return {
    ...resolveApiBaseUrl(configured, platform, apiPort),
    apiTimeoutMs,
  };
}
