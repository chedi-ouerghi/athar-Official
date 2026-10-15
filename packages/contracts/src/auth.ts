/**
 * Accounts and sessions: `/api/v1/auth/*`.
 *
 * A session is a pair of opaque tokens. The access token goes in
 * `Authorization: Bearer <accessToken>` on every call and lives 15 minutes; the
 * refresh token is exchanged at `POST /auth/refresh` for a new pair, and each
 * refresh token works once. The server stores only hashes of both.
 */

import { z } from 'zod';

export const accountRoleSchema = z.enum(['admin', 'customer']);
export type AccountRole = z.infer<typeof accountRoleSchema>;

/** Trimmed and lowercased, so sign-in does not depend on how the email was typed. */
export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

/** A new password. Sign-in accepts any non-empty one, so an old rule never locks anyone out. */
export const passwordSchema = z.string().min(10).max(200);

/** An admin's password is held to a longer minimum. */
export const adminPasswordSchema = z.string().min(14).max(200);

export const accountDisplayNameSchema = z.string().trim().min(1).max(100);

/** Body of `POST /api/v1/auth/login`. */
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/**
 * Body of `POST /api/v1/auth/activate`: the one-time code an admin handed the
 * customer, and the password they choose. Success signs them in.
 */
export const activateRequestSchema = z.object({
  email: emailSchema,
  /** Case and surrounding spaces do not matter. */
  activationCode: z.string().trim().toUpperCase().min(1).max(32),
  password: passwordSchema,
});
export type ActivateRequest = z.infer<typeof activateRequestSchema>;

/** Body of `POST /api/v1/auth/refresh`. */
export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1).max(200),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

/** The signed-in account, as the client sees it. */
export const authAccountSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  role: accountRoleSchema,
});
export type AuthAccount = z.infer<typeof authAccountSchema>;

/** Payload of login, activate and refresh. Expiry times are ISO 8601. */
export const sessionResponseSchema = z.object({
  accessToken: z.string(),
  accessTokenExpiresAt: z.string(),
  refreshToken: z.string(),
  refreshTokenExpiresAt: z.string(),
  account: authAccountSchema,
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

/** Payload of `GET /api/v1/auth/me`. */
export const meResponseSchema = authAccountSchema;
export type MeResponse = AuthAccount;
