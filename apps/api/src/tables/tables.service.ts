import { Inject, Injectable } from '@nestjs/common';
import { featuresFor, type Table } from '@athar/contracts';
import type { Authenticated } from '../auth/auth.service.js';
import { DomainException } from '../common/http/domain.exception.js';
import { AMBIENCES_V1 } from '../designs/data/ambiences.v1.js';
import { DriverError, TABLE_DRIVER, type TableDriver } from '../device/table-driver.js';
import { ACTIVE_JOB_LOOKUP, type ActiveJobLookup } from './active-job-lookup.js';
import { PairingStore } from './pairing-store.js';
import { TableRegistry } from './table-registry.service.js';

/**
 * The public view of a table: what a visitor who scanned its QR code sees.
 *
 * Registration data comes from the registry; `mode` and `connection` come from
 * the driver on every read, so they are never stale and never stored;
 * `activeJobId` comes from the jobs seam; and `readiness.paired` from the
 * calling session's pairing.
 */
@Injectable()
export class TablesService {
  constructor(
    private readonly registry: TableRegistry,
    @Inject(TABLE_DRIVER) private readonly driver: TableDriver,
    @Inject(ACTIVE_JOB_LOOKUP) private readonly jobs: ActiveJobLookup,
    private readonly pairings: PairingStore,
  ) {}

  /**
   * {@link getTable} for a signed-in account: only the owner, or an admin, sees
   * the table; anyone else gets `TABLE_NOT_FOUND`.
   *
   * @throws DomainException `TABLE_NOT_FOUND`
   */
  async getTableFor(tableId: string, caller: Authenticated): Promise<Table> {
    await this.registry.getFor(tableId, caller.account);

    return this.getTable(tableId, caller.sessionId);
  }

  /**
   * Show an LED ambience on the owner's table, and return the table.
   *
   * Checked in order, first failure wins: the ambience exists, the caller owns
   * the table, it is enabled, this session is paired with it, it is online, and
   * its plan includes `ledAmbiences`. A drawing in progress does not stop it:
   * the light is independent of the sand.
   *
   * @throws DomainException `VALIDATION_FAILED`, `TABLE_NOT_FOUND`,
   *   `TABLE_DISABLED`, `PAIRING_REQUIRED`, `TABLE_OFFLINE`, `FEATURE_NOT_IN_PLAN`
   */
  async setAmbience(tableId: string, ambienceId: string, caller: Authenticated): Promise<Table> {
    if (!AMBIENCES_V1.some((ambience) => ambience.id === ambienceId)) {
      throw new DomainException('VALIDATION_FAILED', `No ambience with id ${ambienceId}.`);
    }

    const record = await this.registry.getFor(tableId, caller.account, 'command');

    if (!record.enabled) {
      throw new DomainException('TABLE_DISABLED', `Table ${tableId} is switched off.`);
    }

    if (!this.pairings.isPaired(caller.sessionId, tableId)) {
      throw new DomainException(
        'PAIRING_REQUIRED',
        `Pair with table ${tableId} first (POST /api/v1/tables/${tableId}/pairing).`,
      );
    }

    const { connection } = await this.driver.getStatus(tableId);

    if (connection === 'offline' || connection === 'error') {
      throw new DomainException('TABLE_OFFLINE', `Table ${tableId} is ${connection}.`);
    }

    if (!featuresFor(record).includes('ledAmbiences')) {
      throw new DomainException(
        'FEATURE_NOT_IN_PLAN',
        `The plan of table ${tableId} does not include ledAmbiences.`,
      );
    }

    try {
      await this.driver.setAmbience(tableId, ambienceId);
    } catch (error) {
      // The table dropped off between the check and the command.
      if (error instanceof DriverError) {
        throw new DomainException('TABLE_OFFLINE', `Table ${tableId} could not take it.`);
      }

      throw error;
    }

    this.pairings.pair(caller.sessionId, tableId);

    return this.getTable(tableId, caller.sessionId);
  }

  /**
   * A disabled table is returned like any other, with `enabled: false`, so the
   * app can explain it. Only commands are refused for a disabled table.
   * `readiness` is for `sessionId` (none: not paired).
   *
   * @throws DomainException `TABLE_NOT_FOUND`
   */
  async getTable(tableId: string, sessionId: string | null = null): Promise<Table> {
    const record = await this.registry.get(tableId);
    const status = await this.driver.getStatus(tableId);
    // Asked after `getStatus`: the lookup waits for any event that read settled.
    const activeJobId = await this.jobs.activeJobIdFor(tableId);
    const paired = sessionId !== null && this.pairings.isPaired(sessionId, tableId);
    // The same tests `JobsService.start` applies.
    const online = status.connection !== 'offline' && status.connection !== 'error';
    const free = activeJobId === null;

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
      ambienceId: status.ambienceId,
      readiness: {
        paired,
        online,
        free,
        canStart: record.enabled && paired && online && free,
      },
    };
  }
}
