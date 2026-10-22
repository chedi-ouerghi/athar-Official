import { describe, expect, it } from 'vitest';
import { parsePairingQr } from './parse-pairing-qr';

const HOSTS = ['app.athar.example'];
const ID = 'k7q3x9m2d8r5t6w4';
const TOKEN = 'A'.repeat(43);
const query = `tableId=${ID}&token=${TOKEN}`;

describe('parsePairingQr', () => {
  it('reads the app link, in development and in Expo Go', () => {
    expect(parsePairingQr(`athar://pair?${query}`, { allowedHosts: [] })).toStrictEqual({
      tableId: ID,
      token: TOKEN,
    });
  });

  it('reads an HTTPS link from an allowed host, whatever its case', () => {
    expect(
      parsePairingQr(`https://APP.athar.example/pair?${query}`, { allowedHosts: HOSTS }),
    ).toStrictEqual({ tableId: ID, token: TOKEN });
  });

  it('refuses an HTTPS link from any other host, or with no host allowed', () => {
    expect(
      parsePairingQr(`https://evil.example/pair?${query}`, { allowedHosts: HOSTS }),
    ).toBeNull();
    expect(
      parsePairingQr(`https://app.athar.example/pair?${query}`, { allowedHosts: [] }),
    ).toBeNull();
  });

  it('refuses a look-alike host built with user info or a port', () => {
    expect(
      parsePairingQr(`https://app.athar.example@evil.example/pair?${query}`, {
        allowedHosts: HOSTS,
      }),
    ).toBeNull();
    expect(
      parsePairingQr(`https://app.athar.example:8443/pair?${query}`, { allowedHosts: HOSTS }),
    ).toBeNull();
  });

  it('refuses plain HTTP, even from an allowed host', () => {
    expect(
      parsePairingQr(`http://app.athar.example/pair?${query}`, { allowedHosts: HOSTS }),
    ).toBeNull();
  });

  it('does not open a table from a table link or a bare id: that is only a name', () => {
    expect(parsePairingQr(`athar://t/${ID}`, { allowedHosts: HOSTS })).toBeNull();
    expect(parsePairingQr(`https://app.athar.example/t/${ID}`, { allowedHosts: HOSTS })).toBeNull();
    expect(parsePairingQr(ID, { allowedHosts: HOSTS })).toBeNull();
  });

  it('refuses a token or a table id that is not well formed', () => {
    expect(
      parsePairingQr(`athar://pair?tableId=${ID}&token=short`, { allowedHosts: [] }),
    ).toBeNull();
    expect(
      parsePairingQr(`athar://pair?tableId=X&token=${TOKEN}`, { allowedHosts: [] }),
    ).toBeNull();
    expect(parsePairingQr('', { allowedHosts: HOSTS })).toBeNull();
  });
});
