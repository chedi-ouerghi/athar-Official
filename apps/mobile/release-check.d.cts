export interface ReleaseEnvironment {
  readonly EXPO_PUBLIC_API_BASE_URL?: string | undefined;
  readonly EXPO_PUBLIC_TABLE_LINK_HOSTS?: string | undefined;
}

export function checkReleaseConfig(
  profile: string | undefined,
  environment: ReleaseEnvironment,
): string[];

export function assertReleaseConfig(
  profile: string | undefined,
  environment: ReleaseEnvironment,
): void;
