/**
 * Registration of tables: the operations an administrator performs.
 *
 * This is the one service behind both the admin HTTP endpoints and the
 * `table:create` command, so a table registered from a terminal and one
 * registered over HTTP are created by exactly the same code.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AuthAccount, Plan, UpdateTableRequest } from '@athar/contracts';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { CLOCK, type Clock } from '../device/clock.js';
import { DomainException } from '../common/http/domain.exception.js';
import { buildTableLink } from './table-link.js';
import {
  TABLE_REPOSITORY,
  TableAlreadyExistsError,
  type TableRecord,
  type TableRepository,
} from './table-repository.js';

/** Produces candidate table ids. Replaceable so a test can force a collision. */
export const TABLE_ID_GENERATOR = Symbol('TABLE_ID_GENERATOR');
export type TableIdGenerator = () => string;

/**
 * What registering a table needs; `enabled` has already been defaulted. The
 * order fields default to no owner, `basic` and no voice assistant.
 */
export interface NewTable {
  readonly displayName: string;
  readonly location: string;
  readonly enabled: boolean;
  readonly ownerAccountId?: string | null;
  readonly plan?: Plan;
  readonly voiceAssistant?: boolean;
}

/** Reading a table (or its jobs), or changing what it does (starting and commanding jobs). */
export type TableUse = 'read' | 'command';

/**
 * Who may use a table (decision D1): its owner, for anything; an admin, only to
 * read. Everyone else is told the table does not exist.
 */
export function mayUse(table: TableRecord, account: AuthAccount, use: TableUse): boolean {
  return table.ownerAccountId === account.id || (use === 'read' && account.role === 'admin');
}

/** How many times to retry after generating an id that is already taken. */
const MAX_ID_ATTEMPTS = 5;

@Injectable()
export class TableRegistry {
  private readonly logger = new Logger(TableRegistry.name);

  constructor(
    @Inject(TABLE_REPOSITORY) private readonly repository: TableRepository,
    @Inject(APP_CONFIG) private readonly config: Pick<AppConfig, 'publicLinkBaseUrl'>,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(TABLE_ID_GENERATOR) private readonly newId: TableIdGenerator,
  ) {}

  /** Register a table under a freshly generated id. The caller never chooses the id. */
  async create(input: NewTable): Promise<TableRecord> {
    const now = new Date(this.clock.now()).toISOString();

    for (let attempt = 1; attempt <= MAX_ID_ATTEMPTS; attempt += 1) {
      const record: TableRecord = {
        id: this.newId(),
        displayName: input.displayName,
        location: input.location,
        enabled: input.enabled,
        ownerAccountId: input.ownerAccountId ?? null,
        plan: input.plan ?? 'basic',
        voiceAssistant: input.voiceAssistant ?? false,
        createdAt: now,
        updatedAt: now,
      };

      try {
        await this.repository.create(record);
      } catch (error) {
        if (error instanceof TableAlreadyExistsError) {
          continue;
        }

        throw error;
      }

      this.logger.log(`Registered table ${record.id}`);

      return record;
    }

    throw new Error(`Could not generate an unused table id in ${MAX_ID_ATTEMPTS} attempts.`);
  }

  list(): Promise<readonly TableRecord[]> {
    return this.repository.list();
  }

  /** @throws DomainException `TABLE_NOT_FOUND` */
  async get(tableId: string): Promise<TableRecord> {
    const record = await this.repository.get(tableId);

    if (record === undefined) {
      throw tableNotFound(tableId);
    }

    return record;
  }

  /**
   * The table, if `account` may use it (see {@link mayUse}). One it may not use
   * is `TABLE_NOT_FOUND`, exactly like a missing one, so ids cannot be probed.
   *
   * @throws DomainException `TABLE_NOT_FOUND`
   */
  async getFor(
    tableId: string,
    account: AuthAccount,
    use: TableUse = 'read',
  ): Promise<TableRecord> {
    const record = await this.repository.get(tableId);

    if (record === undefined || !mayUse(record, account, use)) {
      throw tableNotFound(tableId);
    }

    return record;
  }

  /**
   * Change a table's display name, location, `enabled` switch or order.
   *
   * @throws DomainException `TABLE_NOT_FOUND`
   */
  async update(tableId: string, patch: UpdateTableRequest): Promise<TableRecord> {
    const updated = await this.repository.update(tableId, {
      ...patch,
      updatedAt: new Date(this.clock.now()).toISOString(),
    });

    if (updated === undefined) {
      throw tableNotFound(tableId);
    }

    this.logger.log(`Updated table ${tableId}`);

    return updated;
  }

  /**
   * The link a table's QR code encodes.
   *
   * @throws DomainException `TABLE_NOT_FOUND`
   */
  async linkFor(tableId: string): Promise<string> {
    await this.get(tableId);

    return buildTableLink(this.config.publicLinkBaseUrl, tableId);
  }
}

export function tableNotFound(tableId: string): DomainException {
  return new DomainException('TABLE_NOT_FOUND', `No table with id ${tableId}.`);
}
