import { describe, expect, it } from 'vitest';
import { pairingLinkSchema, parsePairingLink } from '@athar/contracts';
import { buildPairingLink } from './pairing-links.js';

const TABLE = 'table-abc';
const TOKEN = 'AbC-_0123456789AbC-_0123456789AbC-_0123456789A'.slice(0, 43);
const EXPIRES = '2026-11-20T13:00:00.000Z';

describe('buildPairingLink', () => {
  it('puts the token on the public origin, and in the app link', () => {
    const link = buildPairingLink('https://link.example.com', TABLE, TOKEN, EXPIRES);

    expect(link).toStrictEqual({
      link: `https://link.example.com/pair?tableId=${TABLE}&token=${TOKEN}`,
      deepLink: `athar://pair?tableId=${TABLE}&token=${TOKEN}`,
      expiresAt: EXPIRES,
    });
    expect(pairingLinkSchema.safeParse(link).success).toBe(true);
  });

  it('is read back by the app parser, from either form', () => {
    const { link, deepLink } = buildPairingLink('https://link.example.com', TABLE, TOKEN, EXPIRES);

    expect(parsePairingLink(link)).toStrictEqual({ tableId: TABLE, token: TOKEN });
    expect(parsePairingLink(deepLink)).toStrictEqual({ tableId: TABLE, token: TOKEN });
  });

  it('falls back to the app link in development, which the schema accepts', () => {
    const link = buildPairingLink(undefined, TABLE, TOKEN, EXPIRES);

    expect(link.link).toBe(link.deepLink);
    expect(pairingLinkSchema.safeParse(link).success).toBe(true);
  });
});
