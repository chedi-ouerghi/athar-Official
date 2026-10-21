/**
 * Pairing and sharing contracts.
 *
 * A table is printed with a QR code holding a one-time **claim token**. The
 * customer scans it and claims the table (`POST /api/v1/tables/pair`), which
 * makes them its owner. An owner can then invite other people with a **share
 * token** (a temporary, revocable link for a guest).
 *
 * Tokens are opaque random strings, not JWTs: the server stores only a hash,
 * which lets it expire, limit and revoke them. A token grants nothing by being
 * seen; it is redeemed by a signed-in account. It never carries (and a QR code
 * must never carry) an MQTT credential.
 */

import { z } from 'zod';
import { tableIdSchema } from './table.js';

/** Random bytes behind a token: 32 bytes -> 43 base64url characters. */
export const PAIRING_TOKEN_BYTES = 32;
export const pairingTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid pairing token');
export type PairingToken = z.infer<typeof pairingTokenSchema>;

/** `owner` is permanent; `guest` is invited by an owner and can be revoked. */
export const tableRoleSchema = z.enum(['owner', 'guest']);
export type TableRole = z.infer<typeof tableRoleSchema>;

/** What a QR code or a shared link holds. */
export const pairingLinkSchema = z.object({
  /** `https://<link host>/pair?...`: opens the app, or the store page without it. */
  link: z.url(),
  /** `athar://pair?tableId=..&token=..`: the app's own scheme. */
  deepLink: z.string().regex(/^athar:\/\/pair\?/),
  expiresAt: z.iso.datetime(),
});
export type PairingLink = z.infer<typeof pairingLinkSchema>;

/** The app's own link for a table and a token. */
export function pairingDeepLink(tableId: string, token: string): string {
  return `athar://pair?tableId=${encodeURIComponent(tableId)}&token=${encodeURIComponent(token)}`;
}

/**
 * Read a scanned `athar://pair?...` or `https://<host>/pair?...` link. Returns
 * `null` for anything else, including a well-formed link with a bad id or token.
 * Query strings are read by hand: React Native's `URL` is incomplete.
 */
export function parsePairingLink(
  value: string,
): { readonly tableId: string; readonly token: string } | null {
  const trimmed = value.trim();

  if (!/^(?:athar:\/\/|https:\/\/[^/?#]+\/)pair\?/.test(trimmed)) {
    return null;
  }

  const query = trimmed.slice(trimmed.indexOf('?') + 1).split('#')[0] ?? '';
  const params = new Map<string, string>();

  for (const pair of query.split('&')) {
    const [key, raw = ''] = pair.split('=');

    if (key !== undefined && !params.has(key)) {
      try {
        params.set(key, decodeURIComponent(raw));
      } catch {
        return null;
      }
    }
  }

  const tableId = tableIdSchema.safeParse(params.get('tableId'));
  const token = pairingTokenSchema.safeParse(params.get('token'));

  return tableId.success && token.success ? { tableId: tableId.data, token: token.data } : null;
}

/**
 * Body of `POST /api/v1/tables/pair` (session required). The token is either a
 * claim token or a share token; the server tells which. An unknown, expired,
 * used-up or revoked token all answer `PAIRING_TOKEN_INVALID`.
 */
export const pairTableRequestSchema = z.object({
  tableId: tableIdSchema,
  token: pairingTokenSchema,
});
export type PairTableRequest = z.infer<typeof pairTableRequestSchema>;

export const pairTableResponseSchema = z.object({
  tableId: tableIdSchema,
  role: tableRoleSchema,
  /** When a guest's access ends; `null` for an owner. */
  expiresAt: z.iso.datetime().nullable(),
});
export type PairTableResponse = z.infer<typeof pairTableResponseSchema>;

// ---------------------------------------------------------------------------
// Share (owner invites guests)
// ---------------------------------------------------------------------------

/** Longest an invitation, or a guest's access, may last: seven days. */
export const SHARE_MAX_HOURS = 168;

/** Body of `POST /api/v1/tables/:tableId/shares` (owner only). */
export const createShareRequestSchema = z.object({
  expiresInHours: z.number().int().min(1).max(SHARE_MAX_HOURS).default(24),
  /** How many accounts may redeem the invitation. */
  maxUses: z.number().int().min(1).max(10).default(1),
});
export type CreateShareRequest = z.infer<typeof createShareRequestSchema>;

/** Payload of `POST /api/v1/tables/:tableId/shares` (`201`). The token is shown once. */
export const createShareResponseSchema = pairingLinkSchema.extend({
  shareId: z.uuid(),
  maxUses: z.number().int().min(1),
});
export type CreateShareResponse = z.infer<typeof createShareResponseSchema>;

export const tableMemberSchema = z.object({
  accountId: z.string().min(1),
  displayName: z.string(),
  role: tableRoleSchema,
  since: z.iso.datetime(),
  expiresAt: z.iso.datetime().nullable(),
});
export type TableMember = z.infer<typeof tableMemberSchema>;

/** Payload of `GET /api/v1/tables/:tableId/members`. */
export const listMembersResponseSchema = z.object({ members: z.array(tableMemberSchema) });
export type ListMembersResponse = z.infer<typeof listMembersResponseSchema>;

/** Path parameters of `DELETE /api/v1/tables/:tableId/members/:accountId` (`204`, owner only). */
export const memberParamsSchema = z.object({
  tableId: tableIdSchema,
  accountId: z.string().min(1).max(100),
});
export type MemberParams = z.infer<typeof memberParamsSchema>;

/** Path parameters of `DELETE /api/v1/tables/:tableId/shares/:shareId` (`204`, owner only). */
export const shareParamsSchema = z.object({ tableId: tableIdSchema, shareId: z.uuid() });
export type ShareParams = z.infer<typeof shareParamsSchema>;
