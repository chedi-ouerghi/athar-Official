/**
 * Development only: with the API running, creates a customer and a "personalized"
 * table, then writes the table's pairing QR code to data/dev-qr/ (gitignored).
 *
 *   ADMIN_EMAIL=a@athar.test ADMIN_PASSWORD=... node scripts/dev-seed.mjs
 *
 * Optional: API_URL (default http://localhost:3000), CUSTOMER_EMAIL.
 */

import QRCode from 'qrcode';
import { mkdir } from 'node:fs/promises';

const api = `${process.env.API_URL ?? 'http://localhost:3000'}/api/v1`;
const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD.');
}

async function call(path, body, token) {
  const response = await fetch(`${api}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      `${path} -> ${response.status} ${json.error?.code ?? ''} ${json.error?.message ?? ''}`,
    );
  }

  return json;
}

const { accessToken } = await call('/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

const customerEmail = process.env.CUSTOMER_EMAIL ?? `client${Date.now() % 100000}@athar.test`;
const customer = await call(
  '/admin/customers',
  { email: customerEmail, displayName: 'Client test' },
  accessToken,
);
const provisioned = await call(
  '/admin/tables/provision',
  { displayName: 'Table test', location: 'Salon', plan: 'personalized' },
  accessToken,
);

await mkdir('data/dev-qr', { recursive: true });
const qrPath = `data/dev-qr/${provisioned.table.id}.png`;
await QRCode.toFile(qrPath, provisioned.pairing.link, { width: 600, margin: 4 });

process.stdout.write(
  [
    `Client       : ${customerEmail}`,
    `Code activation: ${customer.activationCode}`,
    `Table        : ${provisioned.table.id}`,
    `QR a scanner : ${qrPath}`,
    `Lien         : ${provisioned.pairing.link}`,
    '',
  ].join('\n'),
);
