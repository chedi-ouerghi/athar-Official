/**
 * The only place a scanned or typed pairing link is interpreted.
 *
 * A table's QR code holds one thing: the pairing link made for one table and one
 * customer (`athar://pair?tableId=..&token=..`, or the same under
 * `https://<link host>/pair?...` in production). Nothing else opens a table from the
 * scanner: a bare table id or a `/t/<id>` link is only a name and proves nothing.
 *
 * Both link shapes carry a secret token, so they are held to the same rules as a
 * table link: an HTTPS link must come from a host on the allow-list, with no user
 * info and no port, so `https://app.example@evil.test/pair?...` cannot slip through.
 * The token itself is checked by the shared `parsePairingLink`, so the app and the
 * API accept exactly the same shapes.
 *
 * No React Native import and no `URL` class, so it runs under the Node test runner.
 */

import { parsePairingLink } from '@athar/contracts';

export interface PairingQr {
  readonly tableId: string;
  readonly token: string;
}

export interface ParsePairingQrOptions {
  /**
   * Lowercase host names whose HTTPS links are accepted. Empty accepts only the
   * custom scheme.
   */
  readonly allowedHosts: readonly string[];
}

const HTTPS_PAIRING = /^https:\/\/([^/?#@:]+)\/pair\?/i;
const SCHEME_PAIRING = /^athar:\/\/pair\?/i;

/** The table and token in a pairing link we trust, or `null` for anything else. */
export function parsePairingQr(input: string, options: ParsePairingQrOptions): PairingQr | null {
  const link = input.trim();

  if (!SCHEME_PAIRING.test(link)) {
    const https = HTTPS_PAIRING.exec(link);
    const host = https?.[1]?.toLowerCase();

    if (
      host === undefined ||
      !options.allowedHosts.some((allowed) => allowed.toLowerCase() === host)
    ) {
      return null;
    }
  }

  return parsePairingLink(link);
}
