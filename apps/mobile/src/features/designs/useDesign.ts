import type { DesignDetail } from '@athar/contracts';
import { useApiClient } from '../../api/api-client-context';
import { useResource, type Resource } from '../use-resource';

/** One design with its preview path. */
export function useDesign(designId: string): Resource<DesignDetail> {
  const client = useApiClient();

  return useResource((signal) => client.getDesign(designId, signal), [client, designId]);
}
