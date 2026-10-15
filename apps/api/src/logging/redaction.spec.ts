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

const SECRET = 'the-real-secret-0123456789-abcdef';

describe('log redaction', () => {
  it('hides the Authorization header, where access tokens travel', () => {
    const output = logged({ req: { headers: { authorization: `Bearer ${SECRET}` } } });

    expect(output).not.toContain(SECRET);
    expect(output).toContain('[redacted]');
  });

  it.each(['password', 'refreshToken', 'accessToken', 'activationCode'])(
    'hides %s in a request body, at the top level and one level down',
    (field) => {
      expect(logged({ req: { body: { [field]: SECRET } } })).not.toContain(SECRET);
      expect(logged({ [field]: SECRET })).not.toContain(SECRET);
      expect(logged({ body: { [field]: SECRET } })).not.toContain(SECRET);
    },
  );

  it('still logs everything else', () => {
    expect(logged({ config: createTestConfig({ PORT: '4321' }) })).toContain('4321');
    expect(logged({ req: { body: { email: 'a@b.co' } } })).toContain('a@b.co');
  });
});
