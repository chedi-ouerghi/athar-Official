import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { createTestConfig } from '../../test/create-test-config.js';
import { REDACTED_PATHS } from './create-logger.module.js';

/** Log `entry` through pino configured with the API's redaction paths and return the output. */
function logged(entry: Record<string, unknown>): string {
  let output = '';
  const sink = new Writable({
    write(chunk: Buffer, _encoding, done) {
      output += chunk.toString();
      done();
    },
  });

  pino({ redact: { paths: REDACTED_PATHS, censor: '[redacted]' } }, sink).info(entry, 'message');

  return output;
}

const KEY = 'the-real-admin-key-0123456789-abcdef';

describe('log redaction', () => {
  it('hides the Authorization header, where the admin key travels', () => {
    const output = logged({ req: { headers: { authorization: `Bearer ${KEY}` } } });

    expect(output).not.toContain(KEY);
    expect(output).toContain('[redacted]');
  });

  it('hides the admin key if the configuration object is ever logged by mistake', () => {
    const config = createTestConfig({ ADMIN_API_KEY: KEY });

    expect(config.adminApiKey).toBe(KEY);
    expect(logged({ adminApiKey: config.adminApiKey })).not.toContain(KEY);
    expect(logged({ config })).not.toContain(KEY);
    expect(logged({ appConfig: { nested: 1 }, wrapper: { adminApiKey: KEY } })).not.toContain(KEY);
  });

  it('still logs everything else in the configuration', () => {
    expect(logged({ config: createTestConfig({ PORT: '4321' }) })).toContain('4321');
  });
});
