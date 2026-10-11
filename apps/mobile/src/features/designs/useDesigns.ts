import type { ListDesignsResponse } from '@athar/contracts';
import { useApiClient } from '../../api/api-client-context';
import { useResource, type Resource } from '../use-resource';

/** The design collection (without previews). */
export function useDesigns(): Resource<ListDesignsResponse> {
  const client = useApiClient();

  return useResource((signal) => client.listDesigns(signal), [client]);
}
