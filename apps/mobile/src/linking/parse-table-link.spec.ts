import { describe, expect, it } from 'vitest';
import { parseTableLink } from './parse-table-link';

const options = { allowedHosts: ['app.athar.example'] };
const ID = 'k7q3x9m2d8r5t6w4';

describe('parseTableLink', () => {
  it('accepts the HTTPS form from an allowed host', () => {
    expect(parseTableLink(`https://app.athar.example/t/${ID}`, options)).toStrictEqual({
      tableId: ID,
    });
  });

  it('accepts the custom scheme form', () => {
    expect(parseTableLink(`athar://t/${ID}`, options)).toStrictEqual({ tableId: ID });
    expect(parseTableLink(`athar://t/${ID}`, { allowedHosts: [] })).toStrictEqual({ tableId: ID });
  });

  it('ignores case in the scheme and the host, and surrounding whitespace', () => {
    expect(parseTableLink(`  HTTPS://App.Athar.Example/t/${ID}\n`, options)).toStrictEqual({
      tableId: ID,
    });
    expect(parseTableLink(`ATHAR://t/${ID}`, options)).toStrictEqual({ tableId: ID });
  });

  it('tolerates a trailing slash, a query and a fragment', () => {
    expect(parseTableLink(`https://app.athar.example/t/${ID}/`, options).tableId).toBe(ID);
    expect(parseTableLink(`https://app.athar.example/t/${ID}?utm=1#x`, options).tableId).toBe(ID);
    expect(parseTableLink(`athar://t/${ID}?x=1`, options).tableId).toBe(ID);
  });

  it('refuses an HTTPS link from a host that is not allowed', () => {
    expect(parseTableLink(`https://evil.example/t/${ID}`, options)).toStrictEqual({
      error: 'host-not-allowed',
    });
    // A suffix or prefix of an allowed host is a different host.
    expect(parseTableLink(`https://app.athar.example.evil.test/t/${ID}`, options).error).toBe(
      'host-not-allowed',
    );
    expect(parseTableLink(`https://xapp.athar.example/t/${ID}`, options).error).toBe(
      'host-not-allowed',
    );
  });

  it('refuses every HTTPS link when no host is configured', () => {
    expect(parseTableLink(`https://app.athar.example/t/${ID}`, { allowedHosts: [] }).error).toBe(
      'host-not-allowed',
    );
  });

  it('refuses plain http', () => {
    expect(parseTableLink(`http://app.athar.example/t/${ID}`, options).error).toBe(
      'not-a-table-link',
    );
  });

  it('refuses user info and ports instead of ignoring them', () => {
    expect(parseTableLink(`https://app.athar.example@evil.test/t/${ID}`, options).error).toBe(
      'not-a-table-link',
    );
    expect(parseTableLink(`https://app.athar.example:8443/t/${ID}`, options).error).toBe(
      'not-a-table-link',
    );
  });

  it('refuses ids that the shared schema refuses', () => {
    for (const bad of ['ab', 'UPPER-case', 'has_underscore', 'a'.repeat(41), '%41%42%43']) {
      expect(parseTableLink(`athar://t/${bad}`, options).error).toBe('invalid-table-id');
      expect(parseTableLink(`https://app.athar.example/t/${bad}`, options).error).toBe(
        'invalid-table-id',
      );
    }
  });

  it('refuses other paths, extra segments and other schemes', () => {
    for (const bad of [
      `https://app.athar.example/table/${ID}`,
      `https://app.athar.example/t/${ID}/extra`,
      `https://app.athar.example/t/`,
      `https://app.athar.example/`,
      `athar://table/${ID}`,
      `athar://t/${ID}/extra`,
      `otpauth://t/${ID}`,
      ID,
      'hello world',
    ]) {
      expect(parseTableLink(bad, options).error).toBe('not-a-table-link');
    }
  });

  it('reports empty input as empty', () => {
    expect(parseTableLink('', options).error).toBe('empty');
    expect(parseTableLink('   ', options).error).toBe('empty');
  });

  it('returns either an id or an error, never both', () => {
    const ok = parseTableLink(`athar://t/${ID}`, options);
    const bad = parseTableLink('nope', options);

    expect(ok.error).toBeUndefined();
    expect(bad.tableId).toBeUndefined();
  });
});
