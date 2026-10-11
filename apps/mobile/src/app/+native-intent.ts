import { environment } from '../config/environment';
import { parseTableLink } from '../linking/parse-table-link';
import { routes } from '../navigation/routes';

/**
 * Every link the operating system hands to the app passes through here first.
 *
 * `athar://t/<id>` and `https://<allowed host>/t/<id>` are read by
 * `parseTableLink`, the same function the scanner uses, so a link opened from
 * outside and a code scanned inside cannot disagree. A recognised link goes to
 * the table; anything else is left to the router untouched (the home screen for
 * a bare launch, a development URL, and so on).
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  const parsed = parseTableLink(path, { allowedHosts: environment.tableLinkHosts });

  return parsed.tableId === undefined ? path : String(routes.table(parsed.tableId));
}
