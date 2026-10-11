import type { Table } from '@athar/contracts';
import { useApiClient } from '../../api/api-client-context';
import { useResource, type Resource } from '../use-resource';

/** The public view of a table, loaded once and reloadable. */
export function useTable(tableId: string): Resource<Table> {
  const client = useApiClient();

  return useResource((signal) => client.getTable(tableId, signal), [client, tableId]);
}
