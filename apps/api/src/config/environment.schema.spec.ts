import { describe, expect, it } from 'vitest';
import {
  EnvironmentValidationError,
  environmentSchema,
  parseEnvironment,
} from './environment.schema.js';

describe('environmentSchema', () => {
  it('applies safe defaults when nothing is provided', () => {
    const environment = parseEnvironment({});

    expect(environment).toStrictEqual({
      NODE_ENV: 'development',
      HOST: '0.0.0.0',
      PORT: 3000,
      LOG_LEVEL: 'info',
      SHUTDOWN_TIMEOUT_MS: 10_000,
    });
  });

  it('binds to all interfaces by default so emulators and devices can connect', () => {
    expect(parseEnvironment({}).HOST).toBe('0.0.0.0');
  });

  it('coerces numeric strings coming from the environment', () => {
    const environment = parseEnvironment({ PORT: '8080', SHUTDOWN_TIMEOUT_MS: '250' });

    expect(environment.PORT).toBe(8080);
    expect(environment.SHUTDOWN_TIMEOUT_MS).toBe(250);
  });

  it('rejects a NODE_ENV outside the supported modes', () => {
    expect(() => parseEnvironment({ NODE_ENV: 'staging' })).toThrow(EnvironmentValidationError);
  });

  it('rejects a port outside the valid TCP range', () => {
    expect(() => parseEnvironment({ PORT: '70000' })).toThrow(EnvironmentValidationError);
  });

  it('rejects a negative shutdown timeout', () => {
    expect(() => parseEnvironment({ SHUTDOWN_TIMEOUT_MS: '-1' })).toThrow(
      EnvironmentValidationError,
    );
  });

  it('reports every problem at once instead of only the first', () => {
    let caught: unknown;
    try {
      parseEnvironment({ NODE_ENV: 'staging', PORT: 'not-a-number' });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(EnvironmentValidationError);
    expect((caught as EnvironmentValidationError).issues).toHaveLength(2);
  });

  it('ignores variables the service does not read', () => {
    const environment = parseEnvironment({ SOME_UNRELATED_FLAG: '1' });

    expect(Object.keys(environment)).toStrictEqual([
      'NODE_ENV',
      'HOST',
      'PORT',
      'LOG_LEVEL',
      'SHUTDOWN_TIMEOUT_MS',
    ]);
    expect(environmentSchema.shape).not.toHaveProperty('SOME_UNRELATED_FLAG');
  });
});
