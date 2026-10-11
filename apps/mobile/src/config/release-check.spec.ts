import { describe, expect, it } from 'vitest';
import { assertReleaseConfig, checkReleaseConfig } from '../../release-check.cjs';

const GOOD = { EXPO_PUBLIC_API_BASE_URL: 'https://api.athar.app' };

describe('checkReleaseConfig', () => {
  it('does not check development builds, or no profile at all', () => {
    expect(
      checkReleaseConfig('development', { EXPO_PUBLIC_API_BASE_URL: 'http://10.0.2.2:3000' }),
    ).toStrictEqual([]);
    expect(checkReleaseConfig(undefined, {})).toStrictEqual([]);
  });

  it.each(['preview', 'production'])('accepts a real https API in a %s build', (profile) => {
    expect(checkReleaseConfig(profile, GOOD)).toStrictEqual([]);
  });

  it('requires the API address', () => {
    expect(checkReleaseConfig('production', {})[0]).toContain(
      'EXPO_PUBLIC_API_BASE_URL is not set',
    );
    expect(checkReleaseConfig('production', { EXPO_PUBLIC_API_BASE_URL: '  ' })).toHaveLength(1);
  });

  it('refuses plain http outside development', () => {
    const problems = checkReleaseConfig('production', {
      EXPO_PUBLIC_API_BASE_URL: 'http://api.athar.app',
    });

    expect(problems.join()).toContain('must use https');
  });

  it.each([
    'https://api.athar.example',
    'https://localhost',
    'https://10.0.2.2',
    'https://192.168.1.20',
    'https://10.1.2.3',
    'https://172.20.0.5',
    'https://127.0.0.1',
    'https://staging.test',
  ])('refuses the placeholder or local address %s', (url) => {
    const problems = checkReleaseConfig('production', { EXPO_PUBLIC_API_BASE_URL: url });

    expect(problems.join()).toContain('placeholder or a local address');
  });

  it('does not mistake a public 172 address for a private one', () => {
    expect(
      checkReleaseConfig('production', { EXPO_PUBLIC_API_BASE_URL: 'https://172.32.0.1' }),
    ).toStrictEqual([]);
  });

  it('refuses a placeholder link host, but accepts none at all', () => {
    expect(
      checkReleaseConfig('production', {
        ...GOOD,
        EXPO_PUBLIC_TABLE_LINK_HOSTS: 'app.athar.example',
      }).join(),
    ).toContain('EXPO_PUBLIC_TABLE_LINK_HOSTS');
    expect(
      checkReleaseConfig('production', { ...GOOD, EXPO_PUBLIC_TABLE_LINK_HOSTS: '' }),
    ).toStrictEqual([]);
    expect(
      checkReleaseConfig('production', { ...GOOD, EXPO_PUBLIC_TABLE_LINK_HOSTS: 'go.athar.app' }),
    ).toStrictEqual([]);
  });

  it('lists every problem at once', () => {
    const problems = checkReleaseConfig('production', {
      EXPO_PUBLIC_API_BASE_URL: 'http://localhost:3000',
      EXPO_PUBLIC_TABLE_LINK_HOSTS: 'app.athar.example',
    });

    expect(problems.length).toBeGreaterThanOrEqual(3);
  });
});

describe('assertReleaseConfig', () => {
  it('throws one readable error naming the profile and the doc', () => {
    expect(() => assertReleaseConfig('production', {})).toThrow(
      /"production" build profile is not ready[\s\S]*docs\/deployment\.md/,
    );
  });

  it('is silent when the configuration is fine', () => {
    expect(() => {
      assertReleaseConfig('production', GOOD);
    }).not.toThrow();
  });
});
