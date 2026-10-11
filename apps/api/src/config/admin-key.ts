/**
 * Rules for the admin API key, shared by the environment schema (which enforces
 * them at startup) and by tests (which check that the published example is
 * refused in production).
 */

/** Shortest admin key accepted in production. */
export const ADMIN_API_KEY_MIN_LENGTH = 32;

/**
 * The value written in `apps/api/.env.example`.
 *
 * It is deliberately long enough to pass the length rule and deliberately
 * obvious, so that the only thing stopping it from reaching production is the
 * dedicated check against exactly this value. Anyone who copies the example
 * file unchanged gets a startup error instead of a publicly known key.
 */
export const ADMIN_API_KEY_PLACEHOLDER = 'change-me-this-is-a-placeholder-not-a-secret';
