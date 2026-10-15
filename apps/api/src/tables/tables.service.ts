import { Inject, Injectable } from '@nestjs/common';
import { featuresFor, type AuthAccount, type Table } from '@athar/contracts';
import { TABLE_DRIVER, type TableDriver } from '../device/table-driver.js';
import { ACTIVE_JOB_LOOKUP, type ActiveJobLookup } from './active-job-lookup.js';
import { TableRegistry } from './table-registry.service.js';

/**
 * The public view of a table: what a visitor who scanned its QR code sees.
 *
 * Registration data comes from the registry; `mode` and `connection` come from
 * the driver on every read, so they are never stale and never stored; and
 * `activeJobId` comes from the jobs seam.
 */
@Injectable()
export class TablesService {
  constructor(
    private readonly registry: TableRegistry,
    @Inject(TABLE_DRIVER) private readonly driver: TableDriver,
    @Inject(ACTIVE_JOB_LOOKUP) private readonly jobs: ActiveJobLookup,
  ) {}

  /**
   * {@link getTable} for a signed-in account: only the owner, or an admin, sees
   * the table; anyone else gets `TABLE_NOT_FOUND`.
   *
   * @throws DomainException `TABLE_NOT_FOUND`
   */
  async getTableFor(tableId: string, account: AuthAccount): Promise<Table> {
    await this.registry.getFor(tableId, account);

    return this.getTable(tableId);
  }

  /**
   * A disabled table is returned like any other, with `enabled: false`, so the
   * app can explain it. Only commands are refused for a disabled table.
   *
   * @throws DomainException `TABLE_NOT_FOUND`
   */
  async getTable(tableId: string): Promise<Table> {
    const record = await this.registry.get(tableId);
    const status = await this.driver.getStatus(tableId);
    // Asked after `getStatus`: the lookup waits for any event that read settled.
    const activeJobId = await this.jobs.activeJobIdFor(tableId);

    return {
      id: record.id,
      displayName: record.displayName,
      location: record.location,
      enabled: record.enabled,
      mode: status.mode,
      // A table with a job on it is busy, whether or not the driver has caught up yet.
      connection:
        activeJobId !== null && status.connection === 'online' ? 'busy' : status.connection,
      activeJobId,
      plan: record.plan,
      voiceAssistant: record.voiceAssistant,
      // The one place the API derives a table's features.
      features: featuresFor(record),
    };
  }
}
