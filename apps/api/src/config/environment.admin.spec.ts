import { readFileSync } from 'node:fs';
import { parse as parseDotenv } from 'dotenv';
import { describe, expect, it } from 'vitest';
import { EnvironmentValidationError, parseEnvironment } from './environment.schema.js';
import { createAppConfig } from './app-config.js';

/** Run `parseEnvironment` and return the problems it reported, or [] if it accepted the input. */
function problemsWith(raw: Record<string, unknown>): readonly string[] {
  try {
    parseEnvironment(raw);
    return [];
  } catch (error) {
    if (error instanceof EnvironmentValidationError) {
      return error.issues;
    }

    throw error;
  }
}

const EXAMPLE_URL = new URL('../../.env.example', import.meta.url);

describe('the example file', () => {
  const text = readFileSync(EXAMPLE_URL, 'utf8');

  it('is a valid development environment as it stands', () => {
    expect(problemsWith(parseDotenv(text))).toStrictEqual([]);
  });

  it('lists every data file and the QR origin', () => {
    for (const name of [
      'TABLES_DATA_FILE',
      'ACCOUNTS_DATA_FILE',
      'SESSIONS_DATA_FILE',
      'PUBLIC_LINK_BASE_URL',
    ]) {
      expect(text).toContain(name);
    }
  });
});

describe('PUBLIC_LINK_BASE_URL', () => {
  it('is optional in development', () => {
    expect(parseEnvironment({})).not.toHaveProperty('PUBLIC_LINK_BASE_URL');
  });

  it.each([
    ['https://app.athar.example', 'https://app.athar.example'],
    ['https://app.athar.example/', 'https://app.athar.example'],
    ['https://app.athar.example///', 'https://app.athar.example'],
    ['  https://app.athar.example  ', 'https://app.athar.example'],
  ])('accepts %j and normalises it to %j', (raw, expected) => {
    expect(parseEnvironment({ PUBLIC_LINK_BASE_URL: raw }).PUBLIC_LINK_BASE_URL).toBe(expected);
  });

  it.each([
    ['not a URL', 'app.athar.example', /absolute https origin/],
    ['a custom scheme', 'athar://t', /absolute https origin/],
    [
      'http, even in development, because the app refuses http links',
      'http://192.168.1.20',
      /absolute https origin/,
    ],
    [
      'a port, because the app refuses links with one',
      'https://app.athar.example:8443',
      /origin only/,
    ],
    ['an explicit default port', 'https://app.athar.example:443/', /origin only/],
    ['a dangling query mark', 'https://app.athar.example?', /origin only/],
    ['a dangling fragment mark', 'https://app.athar.example#', /origin only/],
    ['a username alone', 'https://user@app.athar.example', /origin only/],
    ['a password alone', 'https://:pw@app.athar.example', /origin only/],
    ['a path', 'https://app.athar.example/app', /origin only/],
    ['a query', 'https://app.athar.example?x=1', /origin only/],
    ['a fragment', 'https://app.athar.example/#top', /origin only/],
    ['credentials', 'https://user:pw@app.athar.example', /origin only/],
  ])('rejects %s', (_label, raw, message) => {
    const [problem] = problemsWith({ PUBLIC_LINK_BASE_URL: raw });

    expect(problem).toMatch(/^PUBLIC_LINK_BASE_URL: /);
    expect(problem).toMatch(message);
  });

  describe('in production', () => {
    const production = { NODE_ENV: 'production' };

    it('is required', () => {
      expect(problemsWith(production)).toStrictEqual([
        'PUBLIC_LINK_BASE_URL: is required when NODE_ENV=production',
      ]);
    });

    it('must use https', () => {
      expect(
        problemsWith({ ...production, PUBLIC_LINK_BASE_URL: 'http://app.athar.example' }),
      ).toStrictEqual([
        'PUBLIC_LINK_BASE_URL: must be an absolute https origin such as https://app.athar.example',
      ]);
    });

    it('accepts an https origin', () => {
      expect(
        problemsWith({ ...production, PUBLIC_LINK_BASE_URL: 'https://app.athar.example' }),
      ).toStrictEqual([]);
    });
  });
});

describe('TABLES_DATA_FILE', () => {
  it('defaults to ./data/tables.json', () => {
    expect(parseEnvironment({}).TABLES_DATA_FILE).toBe('./data/tables.json');
  });

  it('takes any non-empty path, and refuses an empty one', () => {
    expect(
      parseEnvironment({ TABLES_DATA_FILE: '/var/lib/athar/tables.json' }).TABLES_DATA_FILE,
    ).toBe('/var/lib/athar/tables.json');
    expect(problemsWith({ TABLES_DATA_FILE: '' })).not.toHaveLength(0);
  });
});

describe.each([
  ['ACCOUNTS_DATA_FILE', './data/accounts.json'],
  ['SESSIONS_DATA_FILE', './data/sessions.json'],
] as const)('%s', (name, fallback) => {
  it(`defaults to ${fallback}`, () => {
    expect(parseEnvironment({})[name]).toBe(fallback);
  });

  it('refuses an empty path', () => {
    expect(problemsWith({ [name]: '' })).not.toHaveLength(0);
  });
});

describe('TRUST_PROXY', () => {
  it('is unset by default: no proxy is trusted', () => {
    expect(createAppConfig(parseEnvironment({}), 'v').trustProxy).toBeUndefined();
  });

  it.each([
    ['1', 1],
    [' 2 ', 2],
    ['10.0.0.1', ['10.0.0.1']],
    ['10.0.0.0/8, 192.168.1.1 , ::1', ['10.0.0.0/8', '192.168.1.1', '::1']],
    ['fd00::/8', ['fd00::/8']],
  ])('accepts %j as %j', (raw, expected) => {
    expect(createAppConfig(parseEnvironment({ TRUST_PROXY: raw }), 'v').trustProxy).toStrictEqual(
      expected,
    );
  });

  it.each([
    'true',
    'false',
    'yes',
    '-1',
    '1.5',
    '999',
    '10.0.0.0/33',
    '::1/129',
    'example.com',
    '10.0.0.1,',
  ])('refuses %j', (raw) => {
    const [problem] = problemsWith({ TRUST_PROXY: raw });

    expect(problem).toMatch(/^TRUST_PROXY: /);
  });
});
