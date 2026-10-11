/**
 * What a person types into the "Enter table code" field.
 *
 * Two things are accepted: a whole link (pasted from a message, say), which goes
 * through {@link parseTableLink} unchanged, or a bare table id, which is checked
 * with the same shared schema. Anything else is refused with the same errors, so
 * the scanner and the typed fallback cannot disagree about what a valid table is.
 */

import { tableIdSchema } from '@athar/contracts';
import {
  parseTableLink,
  type ParseTableLinkOptions,
  type ParsedTableLink,
} from './parse-table-link';

export function parseTableCode(input: string, options: ParseTableLinkOptions): ParsedTableLink {
  const code = input.trim();

  if (code.length === 0) {
    return { error: 'empty' };
  }

  // A link has a scheme; a bare id never contains a colon.
  if (code.includes(':')) {
    return parseTableLink(code, options);
  }

  // Printed ids are lowercase, but people type capitals and spaces around them.
  const parsed = tableIdSchema.safeParse(code.toLowerCase());

  return parsed.success ? { tableId: parsed.data } : { error: 'invalid-table-id' };
}
