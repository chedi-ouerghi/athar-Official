/**
 * From a failed API call to the translation key of the message a user may read.
 *
 * The server's own `message` is never shown (it is English, written for logs and
 * developers), and no technical word reaches the screen: everything goes through
 * a key in the translation files. Keys, not strings, so the language is chosen
 * where the message is rendered.
 */

import type { ApiErrorCode } from '@athar/contracts';
import type { TranslationKey } from '../i18n/en';
import { ApiError, type ApiErrorKind } from './http-client';

export type ErrorMessageKey = Extract<TranslationKey, `error.${string}`>;

/**
 * A complete `Record` over the contract's codes, so a code added to
 * `@athar/contracts` fails the type check here until someone decides what to
 * tell the user.
 */
const MESSAGE_BY_CODE: Readonly<Record<ApiErrorCode, ErrorMessageKey>> = {
  BAD_REQUEST: 'error.generic',
  NOT_FOUND: 'error.notFound',
  VALIDATION_FAILED: 'error.invalidInput',
  INTERNAL_SERVER_ERROR: 'error.unexpected',
  SERVICE_UNAVAILABLE: 'error.unavailable',
  TABLE_NOT_FOUND: 'error.tableNotFound',
  DESIGN_NOT_FOUND: 'error.designNotFound',
  JOB_NOT_FOUND: 'error.jobNotFound',
  TABLE_DISABLED: 'error.tableDisabled',
  TABLE_OFFLINE: 'error.tableOffline',
  TABLE_BUSY: 'error.tableBusy',
  INVALID_TRANSITION: 'error.notAllowedNow',
  // The app reuses a request id only for a retry of the same design, so this
  // means the app misbehaved; nothing the visitor can act on.
  IDEMPOTENCY_CONFLICT: 'error.generic',
  // Sign-in, ownership and plans: the screens that can meet these (Phase 6)
  // bring their own messages.
  UNAUTHORIZED: 'error.generic',
  INVALID_CREDENTIALS: 'error.generic',
  SESSION_EXPIRED: 'error.generic',
  FORBIDDEN: 'error.generic',
  TOO_MANY_REQUESTS: 'error.generic',
  ACTIVATION_INVALID: 'error.generic',
  ACCOUNT_EXISTS: 'error.generic',
  PAIRING_REQUIRED: 'error.generic',
  FEATURE_NOT_IN_PLAN: 'error.generic',
};

/** Failures that never reached a JSON error from the API. */
const MESSAGE_BY_KIND: Readonly<Record<Exclude<ApiErrorKind, 'http'>, ErrorMessageKey>> = {
  network: 'error.connection',
  timeout: 'error.slow',
  'invalid-response': 'error.unexpected',
  // A cancelled call is the app's own doing and is normally not shown at all.
  cancelled: 'error.generic',
};

/** Message key for any thrown value. Never throws, and never returns "nothing". */
export function errorMessageKey(error: unknown): ErrorMessageKey {
  if (!(error instanceof ApiError)) {
    return 'error.generic';
  }

  if (error.kind !== 'http') {
    return MESSAGE_BY_KIND[error.kind];
  }

  if (error.code !== undefined) {
    return MESSAGE_BY_CODE[error.code];
  }

  // An answer that is not our error envelope, typically from something between
  // the phone and the API (a gateway or proxy). Only the status is known.
  if (error.status === 502 || error.status === 503 || error.status === 504) {
    return 'error.unavailable';
  }

  return error.status !== undefined && error.status >= 500 ? 'error.unexpected' : 'error.generic';
}

/** The codes the mapping covers, for tests that check nothing is missing. */
export const MAPPED_ERROR_CODES = Object.keys(MESSAGE_BY_CODE) as ApiErrorCode[];

/** Every key the mapping can return, for tests that check the translations exist. */
export const ALL_ERROR_MESSAGE_KEYS: readonly ErrorMessageKey[] = [
  ...new Set([...Object.values(MESSAGE_BY_CODE), ...Object.values(MESSAGE_BY_KIND)]),
];
