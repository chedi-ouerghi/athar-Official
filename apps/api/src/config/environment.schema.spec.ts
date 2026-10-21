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
      TABLE_MODE: 'simulation',
      SIMULATION_SPEED_FACTOR: 1,
      SIMULATION_FAULT_EVERY_NTH_JOB: 0,
      SIMULATION_FAULT_AT_PROGRESS: 0.6,
      MQTT_URL: 'mqtt://localhost:1883',
      JOB_HISTORY_LIMIT: 20,
      TABLES_DATA_FILE: './data/tables.json',
      ACCOUNTS_DATA_FILE: './data/accounts.json',
      SESSIONS_DATA_FILE: './data/sessions.json',
      TABLE_ACCESS_DATA_FILE: './data/table-access.json',
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

  describe('table driver settings', () => {
    it('defaults to simulation', () => {
      expect(parseEnvironment({}).TABLE_MODE).toBe('simulation');
    });

    it('accepts hardware at parse time, leaving the refusal to the driver factory', () => {
      expect(parseEnvironment({ TABLE_MODE: 'hardware' }).TABLE_MODE).toBe('hardware');
    });

    it('rejects an unknown mode', () => {
      expect(() => parseEnvironment({ TABLE_MODE: 'real' })).toThrow(EnvironmentValidationError);
      expect(() => parseEnvironment({ TABLE_MODE: 'Simulation' })).toThrow(
        EnvironmentValidationError,
      );
    });

    it('coerces the numeric simulation settings from strings', () => {
      const environment = parseEnvironment({
        SIMULATION_SPEED_FACTOR: '10',
        SIMULATION_FAULT_EVERY_NTH_JOB: '3',
        SIMULATION_FAULT_AT_PROGRESS: '0.25',
      });

      expect(environment.SIMULATION_SPEED_FACTOR).toBe(10);
      expect(environment.SIMULATION_FAULT_EVERY_NTH_JOB).toBe(3);
      expect(environment.SIMULATION_FAULT_AT_PROGRESS).toBe(0.25);
    });

    it.each([
      ['a zero speed factor', { SIMULATION_SPEED_FACTOR: '0' }],
      ['a negative speed factor', { SIMULATION_SPEED_FACTOR: '-2' }],
      ['a non-numeric speed factor', { SIMULATION_SPEED_FACTOR: 'fast' }],
      ['a negative fault interval', { SIMULATION_FAULT_EVERY_NTH_JOB: '-1' }],
      ['a fractional fault interval', { SIMULATION_FAULT_EVERY_NTH_JOB: '1.5' }],
      ['a fault progress above 1', { SIMULATION_FAULT_AT_PROGRESS: '1.1' }],
      ['a negative fault progress', { SIMULATION_FAULT_AT_PROGRESS: '-0.1' }],
    ])('rejects %s', (_label, raw) => {
      expect(() => parseEnvironment(raw)).toThrow(EnvironmentValidationError);
    });
  });

  describe('the MQTT broker (TABLE_MODE=hardware)', () => {
    const production = {
      NODE_ENV: 'production',
      PUBLIC_LINK_BASE_URL: 'https://link.example.com',
      TABLE_MODE: 'hardware',
      MQTT_URL: 'mqtts://broker.example.com:8883',
      MQTT_USERNAME: 'athar-api',
      MQTT_PASSWORD: 'secret',
    };

    it('reads the broker URL and login', () => {
      const environment = parseEnvironment({
        MQTT_URL: 'mqtts://broker.example.com:8883',
        MQTT_USERNAME: 'athar-api',
        MQTT_PASSWORD: 'secret',
      });

      expect(environment.MQTT_URL).toBe('mqtts://broker.example.com:8883');
      expect(environment.MQTT_USERNAME).toBe('athar-api');
      expect(environment.MQTT_PASSWORD).toBe('secret');
    });

    it.each(['localhost:1883', 'http://broker', 'mqtt://', ''])('rejects the URL %j', (value) => {
      expect(() => parseEnvironment({ MQTT_URL: value })).toThrow(EnvironmentValidationError);
    });

    it('accepts a complete production setup', () => {
      expect(parseEnvironment(production).TABLE_MODE).toBe('hardware');
    });

    it('in production needs TLS and a login', () => {
      expect(() => parseEnvironment({ ...production, MQTT_URL: 'mqtt://broker:1883' })).toThrow(
        'MQTT_URL',
      );
      expect(() => parseEnvironment({ ...production, MQTT_USERNAME: undefined })).toThrow(
        'MQTT_USERNAME',
      );
      expect(() => parseEnvironment({ ...production, MQTT_PASSWORD: undefined })).toThrow(
        'MQTT_PASSWORD',
      );
    });

    it('is not demanded of the simulator, even in production', () => {
      expect(() =>
        parseEnvironment({
          NODE_ENV: 'production',
          PUBLIC_LINK_BASE_URL: 'https://link.example.com',
        }),
      ).not.toThrow();
    });
  });

  it('ignores variables the service does not read', () => {
    const environment = parseEnvironment({ SOME_UNRELATED_FLAG: '1' });

    expect(Object.keys(environment)).toStrictEqual([
      'NODE_ENV',
      'HOST',
      'PORT',
      'LOG_LEVEL',
      'SHUTDOWN_TIMEOUT_MS',
      'TABLE_MODE',
      'SIMULATION_SPEED_FACTOR',
      'SIMULATION_FAULT_EVERY_NTH_JOB',
      'SIMULATION_FAULT_AT_PROGRESS',
      'MQTT_URL',
      'JOB_HISTORY_LIMIT',
      'TABLES_DATA_FILE',
      'ACCOUNTS_DATA_FILE',
      'SESSIONS_DATA_FILE',
      'TABLE_ACCESS_DATA_FILE',
    ]);
    expect(environmentSchema.shape).not.toHaveProperty('SOME_UNRELATED_FLAG');
  });
});
