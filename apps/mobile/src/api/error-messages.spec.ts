import { apiErrorCodeSchema, type ApiErrorCode } from '@athar/contracts';
import { describe, expect, it } from 'vitest';
import { ar } from '../i18n/ar';
import { en } from '../i18n/en';
import { ALL_ERROR_MESSAGE_KEYS, MAPPED_ERROR_CODES, errorMessageKey } from './error-messages';
import { ApiError, type ApiErrorKind } from './http-client';

function httpError(code: ApiErrorCode, status = 409): ApiError {
  return new ApiError('http', 'raw', status, code);
}

describe('errorMessageKey', () => {
  it('maps every code in the contract', () => {
    expect([...MAPPED_ERROR_CODES].sort()).toStrictEqual([...apiErrorCodeSchema.options].sort());

    for (const code of apiErrorCodeSchema.options) {
      expect(errorMessageKey(httpError(code)), code).toMatch(/^error\./);
    }
  });

  it('only returns keys that exist in both languages', () => {
    for (const key of ALL_ERROR_MESSAGE_KEYS) {
      expect(en[key]).toBeTypeOf('string');
      expect(ar[key]).toBeTypeOf('string');
    }
  });

  it('gives the domain codes their own messages', () => {
    expect(errorMessageKey(httpError('TABLE_NOT_FOUND', 404))).toBe('error.tableNotFound');
    expect(errorMessageKey(httpError('TABLE_BUSY'))).toBe('error.tableBusy');
    expect(errorMessageKey(httpError('TABLE_OFFLINE'))).toBe('error.tableOffline');
    expect(errorMessageKey(httpError('TABLE_DISABLED'))).toBe('error.tableDisabled');
    expect(errorMessageKey(httpError('JOB_NOT_FOUND', 404))).toBe('error.jobNotFound');
    expect(errorMessageKey(httpError('INVALID_TRANSITION'))).toBe('error.notAllowedNow');
  });

  it('maps failures that never reached the API by kind', () => {
    const byKind = (kind: Exclude<ApiErrorKind, 'http'>) =>
      errorMessageKey(new ApiError(kind, 'raw'));

    expect(byKind('network')).toBe('error.connection');
    expect(byKind('timeout')).toBe('error.slow');
    expect(byKind('invalid-response')).toBe('error.unexpected');
    expect(byKind('cancelled')).toBe('error.generic');
  });

  it('uses the status when an intermediary answered without our envelope', () => {
    expect(errorMessageKey(new ApiError('http', 'raw', 502))).toBe('error.unavailable');
    expect(errorMessageKey(new ApiError('http', 'raw', 500))).toBe('error.unexpected');
    expect(errorMessageKey(new ApiError('http', 'raw', 418))).toBe('error.generic');
  });

  it('never throws and never returns nothing, whatever it is given', () => {
    for (const value of [undefined, null, 'boom', 42, new Error('x'), {}]) {
      expect(errorMessageKey(value)).toBe('error.generic');
    }
  });

  it('never exposes the raw message', () => {
    const key = errorMessageKey(new ApiError('http', 'ECONNREFUSED 10.0.2.2', 409, 'TABLE_BUSY'));

    expect(en[key]).not.toContain('ECONNREFUSED');
  });
});
