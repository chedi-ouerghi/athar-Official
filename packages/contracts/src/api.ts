/**
 * Transport-level constants shared by the API and the mobile client.
 *
 * Keeping the prefix here prevents the two applications from drifting apart on
 * where versioned routes live.
 */

/** API version implemented by this service. */
export const API_VERSION = 'v1';

/** Global route prefix for all versioned endpoints. */
export const API_PREFIX = 'api';

/** Mounted path of the versioned API, always starting with a slash. */
export const API_V1_PREFIX = `/${API_PREFIX}/${API_VERSION}`;
