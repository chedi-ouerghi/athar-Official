import { readFileSync } from 'node:fs';
import { parse as parseDotenv } from 'dotenv';
import { describe, expect, it } from 'vitest';
import { ADMIN_API_KEY_MIN_LENGTH, ADMIN_API_KEY_PLACEHOLDER } from './admin-key.js';
import { EnvironmentValidationError, parseEnvironment } from './environment.schema.js';

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
const GOOD_KEY = 'k'.repeat(ADMIN_API_KEY_MIN_LENGTH);
const PRODUCTION = { NODE_ENV: 'production', PUBLIC_LINK_BASE_URL: 'https://app.athar.example' };

describe('ADMIN_API_KEY', () => {
  it('is optional in development and test, and an unset key is simply absent', () => {
    expect(problemsWith({})).toStrictEqual([]);
    expect(problemsWith({ NODE_ENV: 'test' })).toStrictEqual([]);
    expect(parseEnvironment({})).not.toHaveProperty('ADMIN_API_KEY');
  });

  it('treats an empty value, as in "ADMIN_API_KEY=", as unset', () => {
    expect(parseEnvironment({ ADMIN_API_KEY: '' }).ADMIN_API_KEY).toBeUndefined();
  });

  it('accepts any key in development, even a short one', () => {
    expect(parseEnvironment({ ADMIN_API_KEY: 'short' }).ADMIN_API_KEY).toBe('short');
  });

  describe('in production', () => {
    it('is required', () => {
      expect(problemsWith({ ...PRODUCTION })).toStrictEqual([
        'ADMIN_API_KEY: is required when NODE_ENV=production',
      ]);
    });

    it('is required even when it is an empty string', () => {
      expect(problemsWith({ ...PRODUCTION, ADMIN_API_KEY: '' })).toStrictEqual([
        'ADMIN_API_KEY: is required when NODE_ENV=production',
      ]);
    });

    it('must be at least 32 characters', () => {
      expect(problemsWith({ ...PRODUCTION, ADMIN_API_KEY: 'k'.repeat(31) })).toStrictEqual([
        'ADMIN_API_KEY: must be at least 32 characters when NODE_ENV=production',
      ]);
      expect(problemsWith({ ...PRODUCTION, ADMIN_API_KEY: GOOD_KEY })).toStrictEqual([]);
    });

    it('must not be the placeholder from .env.example', () => {
      expect(
        problemsWith({ ...PRODUCTION, ADMIN_API_KEY: ADMIN_API_KEY_PLACEHOLDER }),
      ).toStrictEqual([
        'ADMIN_API_KEY: is still the placeholder from .env.example; set a real random secret',
      ]);
    });

    it('never quotes the key in an error message', () => {
      const secret = 'short-but-secret';
      const messages = problemsWith({ ...PRODUCTION, ADMIN_API_KEY: secret });

      expect(messages).not.toHaveLength(0);
      expect(messages.join(' ')).not.toContain(secret);
    });
  });

  describe('the example file', () => {
    const text = readFileSync(EXAMPLE_URL, 'utf8');
    const example = parseDotenv(text);

    it('is a valid development environment as it stands', () => {
      expect(problemsWith(example)).toStrictEqual([]);
    });

    it('carries exactly the placeholder, so copying it unchanged cannot reach production', () => {
      expect(example.ADMIN_API_KEY).toBe(ADMIN_API_KEY_PLACEHOLDER);
      expect(
        problemsWith({
          ...example,
          NODE_ENV: 'production',
          PUBLIC_LINK_BASE_URL: 'https://app.athar.example',
        }),
      ).toStrictEqual([
        'ADMIN_API_KEY: is still the placeholder from .env.example; set a real random secret',
      ]);
    });

    it('says clearly that the value is fake', () => {
      expect(text).toMatch(/FAKE PLACEHOLDER/);
    });

    it('lists every setting this change added', () => {
      for (const name of ['TABLES_DATA_FILE', 'ADMIN_API_KEY', 'PUBLIC_LINK_BASE_URL']) {
        expect(text).toContain(name);
      }
    });
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
    const production = { NODE_ENV: 'production', ADMIN_API_KEY: GOOD_KEY };

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

describe('production reports every problem at once', () => {
  it('lists the missing key and the missing origin together', () => {
    expect(problemsWith({ NODE_ENV: 'production' })).toStrictEqual([
      'ADMIN_API_KEY: is required when NODE_ENV=production',
      'PUBLIC_LINK_BASE_URL: is required when NODE_ENV=production',
    ]);
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
