import type { Table } from '@athar/contracts';
import { useApiClient } from '../../api/api-client-context';
import { useResource, type Resource } from '../use-resource';

/** The public view of a table, loaded once and reloadable. */
export function useTable(tableId: string): Resource<Table> {
  const client = useApiClient();

  return useResource(
    async (signal) => {
      // A drawing or a light command needs this session paired with the table, and
      // the pairing lapses when idle. Best effort: a table the account cannot use
      // answers the read below with the real error.
      await client.openPairing(tableId, signal).catch(() => undefined);

      return client.getTable(tableId, signal);
    },
    [client, tableId],
  );
}
