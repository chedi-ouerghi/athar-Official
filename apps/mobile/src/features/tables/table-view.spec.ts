import type { Table } from '@athar/contracts';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../api/http-client';
import { apiError, networkError, table } from '../../test-fixtures';
import { capabilitiesOf, classifyTableView } from './table-view';

const ready = (overrides: Parameters<typeof table>[0] = {}) =>
  ({ status: 'ready', data: table(overrides) }) as const;

describe('classifyTableView', () => {
  it('loading', () => {
    expect(classifyTableView({ status: 'loading' })).toBe('loading');
  });

  it('a healthy, enabled, online table is ready', () => {
    expect(classifyTableView(ready())).toBe('ready');
  });

  it('a disabled table is disabled, whatever its connection', () => {
    expect(classifyTableView(ready({ enabled: false }))).toBe('disabled');
    expect(classifyTableView(ready({ enabled: false, connection: 'offline' }))).toBe('disabled');
  });

  it('offline and error connections are offline', () => {
    expect(classifyTableView(ready({ connection: 'offline' }))).toBe('offline');
    expect(classifyTableView(ready({ connection: 'error' }))).toBe('offline');
  });

  it('a busy table is busy, with or without a known drawing', () => {
    expect(classifyTableView(ready({ connection: 'busy', activeJobId: 'x' }))).toBe('busy');
    expect(classifyTableView(ready({ connection: 'busy' }))).toBe('busy');
  });

  it('an unknown table and an invalid id are both "unknown"', () => {
    const notFound = { status: 'error', error: apiError('TABLE_NOT_FOUND', 404) } as const;
    const invalid = { status: 'error', error: apiError('VALIDATION_FAILED', 400) } as const;

    expect(classifyTableView(notFound)).toBe('unknown');
    expect(classifyTableView(invalid)).toBe('unknown');
  });

  it('every other failure is a retryable error', () => {
    for (const error of [
      networkError(),
      new ApiError('timeout', 'x'),
      apiError('SERVICE_UNAVAILABLE', 503),
      new Error('x'),
    ]) {
      expect(classifyTableView({ status: 'error', error })).toBe('error');
    }
  });
});

describe('capabilitiesOf', () => {
  const personalized: { features: Table['features'] } = {
    features: ['catalogue', 'rake', 'drawingPen', 'ledAmbiences'],
  };

  it('gives an owner of a personalized table the light and the sharing', () => {
    expect(capabilitiesOf(table({ ...personalized, access: { role: 'owner' } }))).toStrictEqual({
      light: true,
      share: true,
    });
  });

  it('lets a guest use the light but never invite anyone', () => {
    expect(capabilitiesOf(table({ ...personalized, access: { role: 'guest' } }))).toStrictEqual({
      light: true,
      share: false,
    });
  });

  it('shows an admin neither', () => {
    expect(capabilitiesOf(table({ ...personalized, access: { role: 'admin' } }))).toStrictEqual({
      light: false,
      share: false,
    });
  });

  it('hides the light when the plan does not include it', () => {
    expect(capabilitiesOf(table({ access: { role: 'owner' } }))).toStrictEqual({
      light: false,
      share: true,
    });
  });
});
