/** Link scheme used in development, when no public origin is configured. */
const DEVELOPMENT_SCHEME_PREFIX = 'athar://t/';

/**
 * The link a table's QR code encodes: `<origin>/t/<tableId>`.
 *
 * With no `PUBLIC_LINK_BASE_URL` (development only) it falls back to the custom
 * scheme, `athar://t/<tableId>`, which the app also opens. The link contains
 * the public table id and nothing else: no token and no signature, because a QR
 * code is never proof of authorisation.
 *
 * @param baseUrl - The configured origin, already normalised (no trailing slash).
 */
export function buildTableLink(baseUrl: string | undefined, tableId: string): string {
  return baseUrl === undefined
    ? `${DEVELOPMENT_SCHEME_PREFIX}${tableId}`
    : `${baseUrl}/t/${tableId}`;
}
