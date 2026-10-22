import type { Table } from '@athar/contracts';
import { ApiError } from '../../api/http-client';
import type { TranslationKey } from '../../i18n/en';
import type { ResourceState } from '../use-resource';

/** What the table screen shows. Exactly one at a time. */
export type TableView =
  | 'loading'
  /** The id is not a table, or not even a valid id. Retrying cannot help. */
  | 'unknown'
  /** Anything else that went wrong while loading, retryable. */
  | 'error'
  | 'disabled'
  | 'offline'
  | 'busy'
  | 'ready';

/**
 * Decide what to show from the load state and the table. The server is the
 * authority on every rule (is it enabled, is it busy); this only turns its answer
 * into one screen state.
 *
 * Designs are offered only in `ready`: a switched-off, unreachable or busy table
 * would refuse the start anyway, so the visitor is told why instead.
 */
export function classifyTableView(state: ResourceState<Table>): TableView {
  switch (state.status) {
    case 'loading':
      return 'loading';
    case 'error': {
      const { error } = state;
      const unknown =
        error instanceof ApiError &&
        error.kind === 'http' &&
        (error.code === 'TABLE_NOT_FOUND' || error.code === 'VALIDATION_FAILED');

      return unknown ? 'unknown' : 'error';
    }
    case 'ready': {
      const table = state.data;

      if (!table.enabled) return 'disabled';
      if (table.connection === 'offline' || table.connection === 'error') return 'offline';
      if (table.connection === 'busy') return 'busy';
      return 'ready';
    }
  }
}

/**
 * What the calling account is shown on a table, from its role and plan. Hiding is
 * a courtesy: the API refuses the same calls to anyone not allowed to make them.
 */
export function capabilitiesOf(table: Table): { readonly light: boolean; readonly share: boolean } {
  const { role } = table.access;

  return {
    // An admin may look at a table but not command it.
    light: role !== 'admin' && table.features.includes('ledAmbiences'),
    // Only the owner invites guests.
    share: role === 'owner',
  };
}

export const CONNECTION_LABEL_KEY: Readonly<Record<Table['connection'], TranslationKey>> = {
  online: 'table.connection.online',
  offline: 'table.connection.offline',
  busy: 'table.connection.busy',
  error: 'table.connection.error',
};
