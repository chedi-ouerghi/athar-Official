import { describe, expect, it } from 'vitest';
import {
  EnvironmentConfigurationError,
  createAppEnvironment,
  joinUrl,
  resolveApiBaseUrl,
  resolveLoopbackHost,
} from './env';

describe('resolveLoopbackHost', () => {
  it('maps an Android emulator to the host alias, not to localhost', () => {
    // 10.0.2.2 is the Android emulator's alias for the host loopback interface;
    // 127.0.0.1 inside an emulator is the emulator itself.
    expect(resolveLoopbackHost('android')).toBe('10.0.2.2');
  });

  it('maps the iOS simulator and web to localhost', () => {
    expect(resolveLoopbackHost('ios')).toBe('localhost');
    expect(resolveLoopbackHost('web')).toBe('localhost');
  });

  it('falls back to localhost for an unknown platform', () => {
    expect(resolveLoopbackHost('macos')).toBe('localhost');
  });
});

describe('resolveApiBaseUrl', () => {
  it('prefers the configured URL over any platform default', () => {
    expect(resolveApiBaseUrl('https://api.athar.test', 'android', 3000)).toStrictEqual({
      apiBaseUrl: 'https://api.athar.test',
      apiBaseUrlSource: 'configured',
    });
  });

  it('strips trailing slashes from the configured URL', () => {
    expect(resolveApiBaseUrl('http://10.1.2.3:3000///', 'ios', 3000).apiBaseUrl).toBe(
      'http://10.1.2.3:3000',
    );
  });

  it('derives a different address per platform when unconfigured', () => {
    expect(resolveApiBaseUrl(undefined, 'android', 3000).apiBaseUrl).toBe('http://10.0.2.2:3000');
    expect(resolveApiBaseUrl(undefined, 'ios', 3000).apiBaseUrl).toBe('http://localhost:3000');
  });

  it('uses the configured port in the derived default', () => {
    expect(resolveApiBaseUrl(undefined, 'android', 8080).apiBaseUrl).toBe('http://10.0.2.2:8080');
  });
});

describe('joinUrl', () => {
  it('joins with exactly one separator', () => {
    expect(joinUrl('http://host:3000', '/health')).toBe('http://host:3000/health');
    expect(joinUrl('http://host:3000/', 'health')).toBe('http://host:3000/health');
  });
});

describe('createAppEnvironment', () => {
  it('applies documented defaults when nothing is configured', () => {
    expect(createAppEnvironment({}, 'ios')).toStrictEqual({
      apiBaseUrl: 'http://localhost:3000',
      apiBaseUrlSource: 'platform-default',
      apiTimeoutMs: 10_000,
    });
  });

  it('coerces numeric strings coming from the build environment', () => {
    const environment = createAppEnvironment(
      { EXPO_PUBLIC_API_PORT: '4000', EXPO_PUBLIC_API_TIMEOUT_MS: '2500' },
      'android',
    );

    expect(environment).toStrictEqual({
      apiBaseUrl: 'http://10.0.2.2:4000',
      apiBaseUrlSource: 'platform-default',
      apiTimeoutMs: 2500,
    });
  });

  it('treats an empty base URL as "not configured"', () => {
    const environment = createAppEnvironment({ EXPO_PUBLIC_API_BASE_URL: '   ' }, 'android');

    expect(environment.apiBaseUrlSource).toBe('platform-default');
    expect(environment.apiBaseUrl).toBe('http://10.0.2.2:3000');
  });

  it('rejects a base URL that is not an absolute http(s) URL', () => {
    expect(() =>
      createAppEnvironment({ EXPO_PUBLIC_API_BASE_URL: '10.0.2.2:3000' }, 'android'),
    ).toThrow(EnvironmentConfigurationError);
  });

  it('rejects a port outside the valid TCP range', () => {
    expect(() => createAppEnvironment({ EXPO_PUBLIC_API_PORT: '70000' }, 'ios')).toThrow(
      EnvironmentConfigurationError,
    );
  });

  it('names the offending variable in the error message', () => {
    expect(() => createAppEnvironment({ EXPO_PUBLIC_API_TIMEOUT_MS: 'soon' }, 'ios')).toThrow(
      /EXPO_PUBLIC_API_TIMEOUT_MS/,
    );
  });
});
