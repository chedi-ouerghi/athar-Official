/**
 * The table driver for real tables: it talks to the controller on each table
 * (a Raspberry Pi) through an MQTT broker. The protocol is in
 * `@athar/contracts` (`device-protocol.ts`); this file only speaks it.
 *
 * How it behaves
 * --------------
 * - **One connection for every table.** The driver subscribes once to the
 *   `ack`, `status` and `presence` topics of all tables and routes by the table
 *   id in the topic. Each table's own broker login (ACL) keeps it from writing
 *   anywhere else; the driver additionally ignores a status whose `tableId`
 *   differs from its topic.
 * - **A command resolves on its `ack`, not on completion.** Every command gets a
 *   `cmdId`; its promise settles when an `ack` with the same id arrives *for the
 *   same table*. A drawing takes minutes and is followed through `status`.
 *   Without an `ack` within {@link DEVICE_ACK_TIMEOUT_MS} the command fails with
 *   `OFFLINE`, and so does one pending when the table's presence turns
 *   `offline` or the broker connection drops.
 * - **No command is queued for later.** A command is refused with `OFFLINE`
 *   unless the table is known to be online right now. Otherwise the client
 *   library would hold it and send it on reconnection, possibly minutes after
 *   the visitor gave up.
 * - **Presence is what the broker says.** `offline` is the table's MQTT Last
 *   Will, published as plain text (`online` / `offline`, retained). A table whose
 *   presence has not been heard yet is treated as offline.
 * - **The table keeps drawing when the network drops.** Losing presence reports
 *   the connection as `offline` but keeps the last phase and progress; the job
 *   is not failed here.
 *
 * shortcut: a timed-out `start` may still have been accepted by a table that
 * answered too late; reconciling that is the job of the persistence phase.
 */

import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import {
  DEVICE_ACK_TIMEOUT_MS,
  DEVICE_PROTOCOL_VERSION,
  deviceAckSchema,
  deviceCommandSchema,
  devicePresenceSchema,
  deviceStatusMessageSchema,
  deviceTopics,
  tableIdSchema,
  type DevicePresence,
  type DeviceStatusMessage,
  type Light,
} from '@athar/contracts';
import {
  DriverError,
  InvalidDriverCommandError,
  type DriverConnection,
  type DriverEvent,
  type DriverStartRequest,
  type DriverStatus,
  type TableDriver,
  type TableMode,
  type Unsubscribe,
} from '../table-driver.js';

/** Messages larger than this are not a table's: ignored without parsing. */
const MAX_MESSAGE_BYTES = 64 * 1024;

const SUBSCRIPTIONS = ['ack', 'status', 'presence'].map((kind) => `athar/v1/t/+/${kind}`);
const TOPIC_PATTERN = /^athar\/v1\/t\/([^/]+)\/(ack|status|presence)$/;

/**
 * The part of an `mqtt` client the driver uses, so that a test can stand in for
 * the broker. `MqttClient` from the `mqtt` package satisfies it.
 */
export interface MqttClientLike {
  readonly connected: boolean;
  publishAsync(
    topic: string,
    message: string,
    options: { qos: 1; retain: false },
  ): Promise<unknown>;
  subscribeAsync(topics: string[], options: { qos: 1 }): Promise<unknown>;
  endAsync(force?: boolean): Promise<unknown>;
  on(event: 'connect' | 'close', listener: () => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'message', listener: (topic: string, payload: Buffer) => void): unknown;
}

export interface MqttTableDriverOptions {
  readonly client: MqttClientLike;
  /** How long to wait for an `ack`. Defaults to {@link DEVICE_ACK_TIMEOUT_MS}. */
  readonly ackTimeoutMs?: number;
}

/** What a command carries besides the envelope the driver adds. */
type CommandBody =
  | {
      type: 'start';
      jobId: string;
      trajectory: DriverStartRequest['trajectory'];
      estimatedDurationSeconds?: number;
    }
  | { type: 'pause' | 'resume' | 'stop'; jobId: string }
  | { type: 'light'; light: Light };

interface PendingCommand {
  readonly tableId: string;
  readonly timer: NodeJS.Timeout;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
}

interface TableState {
  /** `null` until the table's retained presence has been heard. */
  presence: DevicePresence | null;
  last: DeviceStatusMessage | null;
  readonly listeners: Set<(event: DriverEvent) => void>;
}

export class MqttTableDriver implements TableDriver {
  readonly mode: TableMode = 'hardware';

  private readonly logger = new Logger(MqttTableDriver.name);
  private readonly client: MqttClientLike;
  private readonly ackTimeoutMs: number;
  private readonly tables = new Map<string, TableState>();
  private readonly pending = new Map<string, PendingCommand>();

  constructor(options: MqttTableDriverOptions) {
    this.client = options.client;
    this.ackTimeoutMs = options.ackTimeoutMs ?? DEVICE_ACK_TIMEOUT_MS;

    this.client.on('connect', () => {
      // Subscribing again after every connection also delivers the retained
      // presence and status of each table again.
      this.client.subscribeAsync(SUBSCRIPTIONS, { qos: 1 }).catch((error: unknown) => {
        this.logger.error(`Could not subscribe to the table topics: ${describe(error)}`);
      });
    });
    this.client.on('close', () => {
      this.onBrokerLost();
    });
    this.client.on('error', (error) => {
      this.logger.warn(`MQTT client error: ${error.message}`);
    });
    this.client.on('message', (topic, payload) => {
      this.onMessage(topic, payload);
    });
  }

  // -------------------------------------------------------------------------
  // TableDriver
  // -------------------------------------------------------------------------

  getStatus(tableId: string): Promise<DriverStatus> {
    return Promise.resolve(this.statusOf(tableId, this.stateOf(tableId)));
  }

  startJob(tableId: string, request: DriverStartRequest): Promise<void> {
    return this.request(tableId, {
      type: 'start',
      jobId: request.jobId,
      trajectory: request.trajectory,
      ...(request.estimatedDurationSeconds === undefined
        ? {}
        : { estimatedDurationSeconds: request.estimatedDurationSeconds }),
    });
  }

  pause(tableId: string, jobId: string): Promise<void> {
    return this.request(tableId, { type: 'pause', jobId });
  }

  resume(tableId: string, jobId: string): Promise<void> {
    return this.request(tableId, { type: 'resume', jobId });
  }

  stop(tableId: string, jobId: string): Promise<void> {
    return this.request(tableId, { type: 'stop', jobId });
  }

  setAmbience(tableId: string, ambienceId: string): Promise<void> {
    return this.setLight(tableId, { mode: 'preset', ambienceId });
  }

  async setLight(tableId: string, light: Light): Promise<void> {
    await this.request(tableId, { type: 'light', light });

    // The table will say so in its next status; announce it now so the caller
    // reads its own change back.
    const state = this.stateOf(tableId);

    if (state.last !== null) {
      state.last = {
        ...state.last,
        ambienceId: light.mode === 'preset' ? light.ambienceId : null,
        light,
      };
      this.announce(tableId, state);
    }
  }

  subscribe(tableId: string, listener: (event: DriverEvent) => void): Unsubscribe {
    const { listeners } = this.stateOf(tableId);
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }

  /** Nest calls this when the application closes. */
  async onModuleDestroy(): Promise<void> {
    this.rejectPending(() => true, 'The API is shutting down.');
    await this.client.endAsync(true);
  }

  // -------------------------------------------------------------------------
  // Commands
  // -------------------------------------------------------------------------

  private async request(tableId: string, body: CommandBody): Promise<void> {
    const state = this.stateOf(tableId);

    if (!this.client.connected || state.presence !== 'online') {
      throw new DriverError('OFFLINE', `Table ${tableId} is offline.`);
    }

    const parsed = deviceCommandSchema.safeParse({
      v: DEVICE_PROTOCOL_VERSION,
      cmdId: randomUUID(),
      sentAt: new Date().toISOString(),
      ...body,
    });

    if (!parsed.success) {
      const reason = parsed.error.issues.map((issue) => issue.message).join('; ');

      if (body.type === 'start') {
        throw new DriverError('TRAJECTORY_REJECTED', reason);
      }

      throw new InvalidDriverCommandError(`Invalid ${body.type} command: ${reason}`);
    }

    const command = parsed.data;

    const acknowledged = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(command.cmdId);
        reject(
          new DriverError(
            'OFFLINE',
            `Table ${tableId} did not acknowledge ${command.type} within ${this.ackTimeoutMs} ms.`,
          ),
        );
      }, this.ackTimeoutMs);

      this.pending.set(command.cmdId, { tableId, timer, resolve, reject });
    });
    // It is awaited below, but may fail while the publish is still in flight.
    acknowledged.catch(() => undefined);

    try {
      await this.client.publishAsync(deviceTopics(tableId).cmd, JSON.stringify(command), {
        qos: 1,
        retain: false,
      });
    } catch (error) {
      this.forget(command.cmdId);
      throw new DriverError(
        'OFFLINE',
        `Could not send ${command.type} to ${tableId}: ${describe(error)}`,
      );
    }

    return acknowledged;
  }

  /** Forget a pending command and stop its timer; returns it if it was pending. */
  private forget(cmdId: string): PendingCommand | undefined {
    const entry = this.pending.get(cmdId);

    if (entry !== undefined) {
      clearTimeout(entry.timer);
      this.pending.delete(cmdId);
    }

    return entry;
  }

  private rejectPending(matches: (entry: PendingCommand) => boolean, reason: string): void {
    for (const [cmdId, entry] of [...this.pending]) {
      if (matches(entry)) {
        this.forget(cmdId);
        entry.reject(new DriverError('OFFLINE', reason));
      }
    }
  }

  // -------------------------------------------------------------------------
  // Messages
  // -------------------------------------------------------------------------

  private onMessage(topic: string, payload: Buffer): void {
    const match = TOPIC_PATTERN.exec(topic);
    const id = tableIdSchema.safeParse(match?.[1]);

    if (match === null || !id.success || payload.length > MAX_MESSAGE_BYTES) {
      return;
    }

    const tableId = id.data;
    const text = payload.toString('utf8');

    switch (match[2]) {
      case 'presence':
        this.onPresence(tableId, text.trim());
        break;
      case 'ack':
        this.onAck(tableId, text);
        break;
      default:
        this.onStatus(tableId, text);
    }
  }

  private onPresence(tableId: string, text: string): void {
    const presence = devicePresenceSchema.safeParse(text);

    if (!presence.success) {
      this.logger.warn(`Ignored an unreadable presence message for table ${tableId}.`);
      return;
    }

    const state = this.stateOf(tableId);

    if (state.presence === presence.data) {
      return;
    }

    state.presence = presence.data;

    if (presence.data === 'offline') {
      this.rejectPending((entry) => entry.tableId === tableId, `Table ${tableId} went offline.`);
    }

    this.announce(tableId, state);
  }

  private onAck(tableId: string, text: string): void {
    const ack = deviceAckSchema.safeParse(parseJson(text));

    if (!ack.success) {
      this.logger.warn(`Ignored an unreadable ack from table ${tableId}.`);
      return;
    }

    const entry = this.pending.get(ack.data.cmdId);

    // An ack for another table's command, or for one already timed out, is not ours.
    if (entry?.tableId !== tableId) {
      return;
    }

    this.forget(ack.data.cmdId);

    if (ack.data.ok) {
      entry.resolve();
    } else {
      entry.reject(
        new DriverError(ack.data.errorCode ?? 'FAULT', `Table ${tableId} refused the command.`),
      );
    }
  }

  private onStatus(tableId: string, text: string): void {
    const status = deviceStatusMessageSchema.safeParse(parseJson(text));

    if (!status.success) {
      this.logger.warn(`Ignored an unreadable status from table ${tableId}.`);
      return;
    }

    if (status.data.tableId !== tableId) {
      this.logger.warn(`Ignored a status on table ${tableId}'s topic naming another table.`);
      return;
    }

    const state = this.stateOf(tableId);
    state.last = status.data;
    this.announce(tableId, state);
  }

  /** The broker connection dropped: nothing is known about any table until it returns. */
  private onBrokerLost(): void {
    this.rejectPending(() => true, 'The connection to the broker was lost.');

    for (const [tableId, state] of this.tables) {
      if (state.presence !== null) {
        state.presence = null;
        this.announce(tableId, state);
      }
    }
  }

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  private stateOf(tableId: string): TableState {
    let state = this.tables.get(tableId);

    if (state === undefined) {
      state = { presence: null, last: null, listeners: new Set() };
      this.tables.set(tableId, state);
    }

    return state;
  }

  private statusOf(tableId: string, state: TableState): DriverStatus {
    const { last } = state;
    const phase = last?.phase ?? 'idle';
    const active = phase === 'drawing' || phase === 'paused';
    let connection: DriverConnection = 'online';

    if (state.presence !== 'online') {
      connection = 'offline';
    } else if (last?.connection === 'error') {
      connection = 'error';
    } else if (active) {
      connection = 'busy';
    }

    return {
      tableId,
      mode: this.mode,
      connection,
      phase,
      jobId: last?.jobId ?? null,
      progress: last?.progress ?? 0,
      errorCode: last?.errorCode ?? null,
      ambienceId: last?.ambienceId ?? null,
      observedAt: last?.observedAt ?? new Date().toISOString(),
    };
  }

  private announce(tableId: string, state: TableState): void {
    const event = this.statusOf(tableId, state);

    for (const listener of [...state.listeners]) {
      try {
        listener(event);
      } catch (error) {
        this.logger.warn(`A status listener threw and was ignored: ${describe(error)}`);
      }
    }
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
