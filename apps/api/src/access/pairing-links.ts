import { pairingDeepLink, type PairingLink } from '@athar/contracts';

/**
 * The links a claim or share token travels in.
 *
 * - `link` is what a QR code or a message holds: `<origin>/pair?tableId=..&token=..`
 *   on the configured public origin (https, validated at startup), which opens the
 *   app through a universal link and lands on a web page without it.
 * - `deepLink` is the app's own `athar://pair?...`, accepted by the app as a fallback.
 *
 * With no `PUBLIC_LINK_BASE_URL` (development only) both are the deep link, as
 * for a table's own link.
 *
 * The token is in the query string on purpose: the link must work from a
 * camera. Servers that log URLs should therefore not log this path's query.
 *
 * @param baseUrl - The configured origin, already normalised (no trailing slash).
 */
export function buildPairingLink(
  baseUrl: string | undefined,
  tableId: string,
  token: string,
  expiresAt: string,
): PairingLink {
  const deepLink = pairingDeepLink(tableId, token);
  const link =
    baseUrl === undefined
      ? deepLink
      : `${baseUrl}/pair?tableId=${encodeURIComponent(tableId)}&token=${encodeURIComponent(token)}`;

  return { link, deepLink, expiresAt };
}
