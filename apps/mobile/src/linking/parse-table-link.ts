/**
 * The only place a table link is interpreted.
 *
 * Two forms are accepted (docs/architecture.md, section 6):
 *
 * - `https://<host>/t/<tableId>`, printed on the QR code. The host must be in the
 *   configured allow-list, so a code pointing anywhere else is refused.
 * - `athar://t/<tableId>`, for development and Expo Go.
 *
 * The id is checked with the shared `tableIdSchema`, so the app and the API
 * accept exactly the same ids. A link is untrusted input: it carries a public
 * table id and nothing else, and is never proof of authorisation.
 *
 * No React Native import, and no `URL` class (not reliable for custom schemes on
 * every engine), so the same code runs under the Node test runner.
 */

import { tableIdSchema } from '@athar/contracts';

export type TableLinkError =
  /** Nothing to parse. */
  | 'empty'
  /** Not one of the two link shapes. */
  | 'not-a-table-link'
  /** An HTTPS link, but not from a host the app trusts. */
  | 'host-not-allowed'
  /** The link has the right shape but the id is not a valid table id. */
  | 'invalid-table-id';

export type ParsedTableLink =
  | { readonly tableId: string; readonly error?: undefined }
  | { readonly error: TableLinkError; readonly tableId?: undefined };

export interface ParseTableLinkOptions {
  /**
   * Lowercase host names whose HTTPS links are accepted. Empty accepts only the
   * custom scheme.
   */
  readonly allowedHosts: readonly string[];
}

// A host without user info (`@`) or port (`:`): both are refused rather than
// ignored, so `https://app.example@evil.test/t/x` and a look-alike port cannot
// slip through. Query and fragment are tolerated and ignored.
const HTTPS_LINK = /^https:\/\/([^/?#@:]+)\/t\/([^/?#]+)\/?(?:[?#].*)?$/i;
const SCHEME_LINK = /^athar:\/\/t\/([^/?#]+)\/?(?:[?#].*)?$/i;

function validateId(candidate: string): ParsedTableLink {
  const parsed = tableIdSchema.safeParse(candidate);

  return parsed.success ? { tableId: parsed.data } : { error: 'invalid-table-id' };
}

export function parseTableLink(input: string, options: ParseTableLinkOptions): ParsedTableLink {
  const link = input.trim();

  if (link.length === 0) {
    return { error: 'empty' };
  }

  const scheme = SCHEME_LINK.exec(link);

  if (scheme?.[1] !== undefined) {
    return validateId(scheme[1]);
  }

  const https = HTTPS_LINK.exec(link);

  if (https?.[1] !== undefined && https[2] !== undefined) {
    const allowed = options.allowedHosts.map((host) => host.toLowerCase());

    return allowed.includes(https[1].toLowerCase())
      ? validateId(https[2])
      : { error: 'host-not-allowed' };
  }

  return { error: 'not-a-table-link' };
}
