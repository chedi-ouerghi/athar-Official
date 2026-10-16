import type { DesignDetail } from '@athar/contracts';
import { useApiClient } from '../../api/api-client-context';
import { useResource, type Resource } from '../use-resource';

/**
 * One design with its preview path. For `null` (a rake or freehand job, which
 * draws no catalogue design) nothing is fetched and the data is `null`.
 */
export function useDesign(designId: string): Resource<DesignDetail>;
export function useDesign(designId: string | null): Resource<DesignDetail | null>;
export function useDesign(designId: string | null): Resource<DesignDetail | null> {
  const client = useApiClient();

  return useResource(
    (signal) => (designId === null ? Promise.resolve(null) : client.getDesign(designId, signal)),
    [client, designId],
  );
}
