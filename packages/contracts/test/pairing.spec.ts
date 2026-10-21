import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  claimTokenResponseSchema,
  createShareRequestSchema,
  createShareResponseSchema,
  pairTableRequestSchema,
  pairingDeepLink,
  pairingLinkSchema,
  pairingTokenSchema,
  parsePairingLink,
  provisionTableRequestSchema,
  provisionTableResponseSchema,
  tableRoleSchema,
} from '../src/index.js';

const TOKEN = 'AbC-_0123456789AbC-_0123456789AbC-_0123456789A'.slice(0, 43);
const NOW = '2026-10-21T13:00:00.000Z';

describe('pairingTokenSchema', () => {
  it('is 43 base64url characters', () => {
    expect(TOKEN).toHaveLength(43);
    expect(pairingTokenSchema.safeParse(TOKEN).success).toBe(true);
  });

  it.each([
    '',
    'short',
    `${TOKEN}A`,
    `${TOKEN.slice(1)}+`,
    `${TOKEN.slice(1)}=`,
    `${TOKEN.slice(1)} `,
  ])('rejects %j', (value) => {
    expect(pairingTokenSchema.safeParse(value).success).toBe(false);
  });
});

describe('pairing links', () => {
  it('the deep link is accepted by the link schema and parses back', () => {
    const deepLink = pairingDeepLink('table-abc', TOKEN);

    expect(deepLink).toBe(`athar://pair?tableId=table-abc&token=${TOKEN}`);
    expect(
      pairingLinkSchema.safeParse({
        link: `https://link.example.com/pair?tableId=table-abc&token=${TOKEN}`,
        deepLink,
        expiresAt: NOW,
      }).success,
    ).toBe(true);
    expect(parsePairingLink(deepLink)).toStrictEqual({ tableId: 'table-abc', token: TOKEN });
  });

  it('parses the https form, ignoring the fragment and parameter order', () => {
    expect(
      parsePairingLink(` https://link.example.com/pair?token=${TOKEN}&tableId=table-abc#x `),
    ).toStrictEqual({ tableId: 'table-abc', token: TOKEN });
  });

  it.each([
    'https://link.example.com/t/table-abc',
    'http://link.example.com/pair?tableId=table-abc&token=' + TOKEN,
    'athar://other?tableId=table-abc&token=' + TOKEN,
    'athar://pair?tableId=table-abc',
    'athar://pair?tableId=Bad_Id&token=' + TOKEN,
    'athar://pair?tableId=table-abc&token=short',
    'athar://pair?tableId=%E0%A4%A&token=' + TOKEN,
    'not a link',
    '',
  ])('returns null for %j', (value) => {
    expect(parsePairingLink(value)).toBeNull();
  });

  it('takes the first value of a repeated parameter', () => {
    expect(
      parsePairingLink(`athar://pair?tableId=table-abc&tableId=other-one&token=${TOKEN}`),
    ).toStrictEqual({ tableId: 'table-abc', token: TOKEN });
  });
});

describe('pair request and roles', () => {
  it('validates the table id and the token', () => {
    expect(pairTableRequestSchema.safeParse({ tableId: 'table-abc', token: TOKEN }).success).toBe(
      true,
    );
    expect(pairTableRequestSchema.safeParse({ tableId: 'X', token: TOKEN }).success).toBe(false);
    expect(pairTableRequestSchema.safeParse({ tableId: 'table-abc', token: 'x' }).success).toBe(
      false,
    );
  });

  it('knows owner and guest only', () => {
    expect(tableRoleSchema.options).toStrictEqual(['owner', 'guest']);
  });
});

describe('share', () => {
  it('defaults to one day and one use', () => {
    expect(createShareRequestSchema.parse({})).toStrictEqual({ expiresInHours: 24, maxUses: 1 });
  });

  it('bounds duration and uses', () => {
    expect(createShareRequestSchema.safeParse({ expiresInHours: 0 }).success).toBe(false);
    expect(createShareRequestSchema.safeParse({ expiresInHours: 169 }).success).toBe(false);
    expect(createShareRequestSchema.safeParse({ maxUses: 11 }).success).toBe(false);
    expect(createShareRequestSchema.safeParse({ maxUses: 1.5 }).success).toBe(false);
  });

  it('a created share carries its link and id', () => {
    expect(
      createShareResponseSchema.safeParse({
        shareId: randomUUID(),
        maxUses: 2,
        link: `https://link.example.com/pair?tableId=table-abc&token=${TOKEN}`,
        deepLink: pairingDeepLink('table-abc', TOKEN),
        expiresAt: NOW,
      }).success,
    ).toBe(true);
  });
});

describe('provisioning', () => {
  const table = {
    id: 'table-abc',
    displayName: 'Main hall',
    location: 'Ground floor',
    enabled: true,
    ownerAccountId: null,
    plan: 'basic',
    voiceAssistant: false,
    createdAt: NOW,
    updatedAt: NOW,
  };
  const mqtt = {
    host: 'mqtt.example.com',
    port: 8883,
    tls: true,
    clientId: 'table-abc',
    username: 't-table-abc',
    password: 'secret',
  };
  const pairing = {
    token: TOKEN,
    link: `https://link.example.com/pair?tableId=table-abc&token=${TOKEN}`,
    deepLink: pairingDeepLink('table-abc', TOKEN),
    expiresAt: NOW,
  };

  it('the request has no owner: the customer claims the table', () => {
    const parsed = provisionTableRequestSchema.parse({
      displayName: 'Main hall',
      location: 'Ground floor',
      ownerAccountId: 'someone',
    });

    expect(parsed).not.toHaveProperty('ownerAccountId');
    expect(parsed.enabled).toBe(true);
  });

  it('the response holds the broker login and the claim link', () => {
    expect(provisionTableResponseSchema.safeParse({ table, mqtt, pairing }).success).toBe(true);
  });

  it('says whether the broker connection uses TLS (a plain broker is for development)', () => {
    expect(
      provisionTableResponseSchema.safeParse({ table, mqtt: { ...mqtt, tls: false }, pairing })
        .success,
    ).toBe(true);
    expect(
      provisionTableResponseSchema.safeParse({ table, mqtt: { ...mqtt, tls: 'yes' }, pairing })
        .success,
    ).toBe(false);
  });

  it('a regenerated claim link names its table', () => {
    expect(claimTokenResponseSchema.safeParse({ tableId: 'table-abc', pairing }).success).toBe(
      true,
    );
    expect(claimTokenResponseSchema.safeParse({ tableId: 'table-abc' }).success).toBe(false);
  });

  it('the pairing part carries no MQTT credential', () => {
    const parsed = provisionTableResponseSchema.parse({ table, mqtt, pairing });

    expect(JSON.stringify(parsed.pairing)).not.toContain(mqtt.password);
  });
});
