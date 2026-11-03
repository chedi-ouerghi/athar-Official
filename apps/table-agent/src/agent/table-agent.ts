/**
 * The orchestrator: subscribes to the table's `cmd` topic, speaks the
 * protocol (`ack`/`status`/`presence`) defined in
 * `packages/contracts/src/device-protocol.ts`, and drives a `BoardPort`
 * through a `GcodeStream`. One `TableAgent` instance per table (the Pi runs
 * exactly one, per `hardware/table-agent/agent.example.yaml`).
 */

import {
  DEVICE_PROTOCOL_VERSION,
  deviceCommandSchema,
  deviceTopics,
  type DeviceCommand,
  type DriverConnection,
  type DriverErrorCode,
  type DriverPhase,
  type Light,
} from '@athar/contracts';
import { BoardCancelledError, type BoardPort } from '../board/board-port.js';
import type { AgentConfig } from '../config/load-config.js';
import { streamGcode } from '../motion/gcode-stream.js';
import { planGcodeMotion } from '../motion/polar-to-gcode.js';
import type { MqttPort } from '../mqtt/mqtt-port.js';

/**
 * Largest command message the agent will parse. It must hold a full trajectory:
 * the contract allows TRAJECTORY_MAX_POINTS (50 000) points, and the built-in
 * designs already reach ~170 KB (a 64 KB cap silently dropped them, so the API
 * never got an `ack` and failed the job as OFFLINE).
 */
const MAX_MESSAGE_BYTES = 4 * 1024 * 1024;
/** Bounded so a long-running agent does not grow this map forever. */
const RECENT_ACK_LIMIT = 64;
const MIN_PLAN_LENGTH = 1e-9;

interface AckOutcome {
  readonly ok: boolean;
  readonly errorCode: DriverErrorCode | null;
}

export interface TableAgentOptions {
  readonly config: AgentConfig;
  readonly mqtt: MqttPort;
  readonly board: BoardPort;
}

export class TableAgent {
  private readonly config: AgentConfig;
  private readonly mqtt: MqttPort;
  private readonly board: BoardPort;
  private readonly topics: ReturnType<typeof deviceTopics>;

  private readonly recentAcks = new Map<string, AckOutcome>();
  private statusPollTimer: ReturnType<typeof setInterval> | null = null;

  private phase: DriverPhase = 'idle';
  private jobId: string | null = null;
  private progress = 0;
  private errorCode: DriverErrorCode | null = null;
  private light: Light | null = null;
  private ambienceId: string | null = null;
  private homed = false;

  constructor(options: TableAgentOptions) {
    this.config = options.config;
    this.mqtt = options.mqtt;
    this.board = options.board;
    this.topics = deviceTopics(options.config.tableId);

    this.board.onAlarm((code) => {
      this.onBoardFault(`ALARM:${code}`);
    });
    this.board.onDisconnect((error) => {
      this.onBoardFault(error.message);
    });

    this.mqtt.on('connect', () => {
      this.onMqttConnect();
    });
    this.mqtt.on('message', (topic, payload) => {
      this.onMqttMessage(topic, payload);
    });
  }

  /** Opens the board, then connects MQTT's own lifecycle drives the rest (see constructor). */
  async start(): Promise<void> {
    await this.board.open();

    this.statusPollTimer = setInterval(() => {
      if (this.board.isOpen) {
        this.board.sendRealtime('?');
      }
    }, this.config.board.statusPollMs);
    // Never postpone process shutdown just to keep polling.
    this.statusPollTimer.unref?.();
  }

  async close(): Promise<void> {
    if (this.statusPollTimer !== null) {
      clearInterval(this.statusPollTimer);
      this.statusPollTimer = null;
    }

    await this.board.close();
    await this.mqtt.endAsync(true);
  }

  // -------------------------------------------------------------------------
  // MQTT
  // -------------------------------------------------------------------------

  private onMqttConnect(): void {
    this.mqtt.subscribeAsync([this.topics.cmd], { qos: 1 }).catch(() => undefined);
    this.publishPresence('online');
    this.publishStatus();
  }

  private onMqttMessage(topic: string, payload: Buffer): void {
    if (topic !== this.topics.cmd || payload.length > MAX_MESSAGE_BYTES) {
      return;
    }

    const parsed = deviceCommandSchema.safeParse(parseJson(payload.toString('utf8')));

    if (!parsed.success) {
      return;
    }

    this.onCommand(parsed.data);
  }

  private publishPresence(state: 'online' | 'offline'): void {
    void this.mqtt.publishAsync(this.topics.presence, state, { qos: 1, retain: true });
  }

  private publishAck(cmdId: string, outcome: AckOutcome): void {
    void this.mqtt.publishAsync(
      this.topics.ack,
      JSON.stringify({ v: DEVICE_PROTOCOL_VERSION, cmdId, ...outcome }),
      { qos: 1, retain: false },
    );
  }

  private publishStatus(): void {
    const status = {
      v: DEVICE_PROTOCOL_VERSION,
      tableId: this.config.tableId,
      mode: 'hardware' as const,
      connection: this.connection(),
      phase: this.phase,
      jobId: this.jobId,
      progress: this.progress,
      errorCode: this.errorCode,
      ambienceId: this.ambienceId,
      light: this.light,
      observedAt: new Date().toISOString(),
    };

    void this.mqtt.publishAsync(this.topics.status, JSON.stringify(status), {
      qos: 1,
      retain: true,
    });
  }

  private connection(): DriverConnection {
    if (!this.board.isOpen) {
      return 'error';
    }

    if (this.phase === 'drawing' || this.phase === 'paused') {
      return 'busy';
    }

    return 'online';
  }

  // -------------------------------------------------------------------------
  // Commands
  // -------------------------------------------------------------------------

  /**
   * Deliberately synchronous, start to finish (every `handle*` below is too):
   * the cmdId dedup check, running the command, and caching its outcome must
   * happen as one atomic step with no `await` in between, or two copies of the
   * same QoS 1 redelivery arriving back to back could both miss the cache and
   * run the command twice.
   */
  private onCommand(command: DeviceCommand): void {
    const cached = this.recentAcks.get(command.cmdId);

    // QoS 1 may deliver the same `cmdId` twice: answer identically, do nothing twice.
    if (cached !== undefined) {
      this.publishAck(command.cmdId, cached);
      return;
    }

    const outcome = this.handleCommand(command);
    this.remember(command.cmdId, outcome);
    this.publishAck(command.cmdId, outcome);
  }

  private remember(cmdId: string, outcome: AckOutcome): void {
    this.recentAcks.set(cmdId, outcome);

    if (this.recentAcks.size > RECENT_ACK_LIMIT) {
      const oldest = this.recentAcks.keys().next().value;

      if (oldest !== undefined) {
        this.recentAcks.delete(oldest);
      }
    }
  }

  private handleCommand(command: DeviceCommand): AckOutcome {
    switch (command.type) {
      case 'start':
        return this.handleStart(command);
      case 'pause':
        return this.handlePause(command.jobId);
      case 'resume':
        return this.handleResume(command.jobId);
      case 'stop':
        return this.handleStop(command.jobId);
      case 'light':
        this.light = command.light;
        this.ambienceId = command.light.mode === 'preset' ? command.light.ambienceId : null;
        this.publishStatus();
        return { ok: true, errorCode: null };
    }
  }

  private handleStart(command: Extract<DeviceCommand, { type: 'start' }>): AckOutcome {
    if (this.phase === 'drawing' || this.phase === 'paused') {
      return { ok: false, errorCode: 'BUSY' };
    }

    // `command.geometry` (the API's abstract width/height shape, for scaling a
    // preview) is intentionally ignored: this agent's physical calibration
    // (radius, coupling, margin) lives in its own `agent.yaml`, on the table —
    // see the header comment of `hardware/table-agent/agent.example.yaml`.
    const plan = planGcodeMotion(
      command.trajectory.points,
      this.config.geometry,
      this.config.motion,
    );

    if (plan.totalLength < MIN_PLAN_LENGTH) {
      return { ok: false, errorCode: 'TRAJECTORY_REJECTED' };
    }

    this.jobId = command.jobId;
    this.phase = 'drawing';
    this.progress = 0;
    this.errorCode = null;
    this.publishStatus();

    void this.runJob(command.jobId, plan);

    return { ok: true, errorCode: null };
  }

  private handlePause(jobId: string): AckOutcome {
    if (this.jobId !== jobId || this.phase !== 'drawing') {
      return { ok: false, errorCode: 'FAULT' };
    }

    this.board.sendRealtime('!');
    this.phase = 'paused';
    this.publishStatus();

    return { ok: true, errorCode: null };
  }

  private handleResume(jobId: string): AckOutcome {
    if (this.jobId !== jobId || this.phase !== 'paused') {
      return { ok: false, errorCode: 'FAULT' };
    }

    this.board.sendRealtime('~');
    this.phase = 'drawing';
    this.publishStatus();

    return { ok: true, errorCode: null };
  }

  private handleStop(jobId: string): AckOutcome {
    if (this.jobId !== jobId || (this.phase !== 'drawing' && this.phase !== 'paused')) {
      // Nothing active under this id: stopping it is a no-op, not an error.
      return { ok: true, errorCode: null };
    }

    this.board.sendRealtime('\x18');
    this.board.cancelPending();
    this.phase = 'cancelled';
    this.progress = 0;
    this.publishStatus();

    return { ok: true, errorCode: null };
  }

  // -------------------------------------------------------------------------
  // Drawing
  // -------------------------------------------------------------------------

  private async runJob(
    jobId: string,
    plan: ReturnType<typeof planGcodeMotion>,
  ): Promise<void> {
    try {
      if (this.config.motion.homeBeforeJob || !this.homed) {
        await this.board.sendLine('$H');
        this.homed = true;
      }

      await this.board.sendLine('G91');

      await streamGcode(
        this.board,
        plan.segments.map((segment) => segment.gcode),
        {
          plannerBufferLines: this.config.board.plannerBufferLines,
          onSent: (index) => {
            if (this.jobId !== jobId || this.phase !== 'drawing') {
              return;
            }

            const segment = plan.segments[index];
            this.progress =
              plan.totalLength > 0 ? (segment?.cumulativeLength ?? plan.totalLength) / plan.totalLength : 1;
            this.publishStatus();
          },
        },
      );

      if (this.jobId === jobId && this.phase === 'drawing') {
        this.phase = 'completed';
        this.progress = 1;
        this.publishStatus();
        this.rewrapThetaIfIdle();
      }
    } catch (error) {
      if (error instanceof BoardCancelledError) {
        // `stop` already moved the phase to `cancelled` and published it.
        return;
      }

      if (this.jobId === jobId) {
        this.phase = 'failed';
        this.errorCode = 'FAULT';
        this.publishStatus();
      }
    }
  }

  private onBoardFault(reason: string): void {
    if (this.phase === 'drawing' || this.phase === 'paused') {
      this.phase = 'failed';
      this.errorCode = 'FAULT';
    }

    this.homed = false;
    void reason; // surfaced to callers through `status`, not logged here (no logger wired in yet)
    this.publishStatus();
  }

  /** `G92` recentres theta into `[0, 360)` without moving, to bound float drift on long sessions. */
  private rewrapThetaIfIdle(): void {
    if (!this.config.motion.rewrapThetaWhenIdle) {
      return;
    }

    const unsubscribe = this.board.onStatus((report) => {
      unsubscribe();
      const thetaDeg = report.mpos?.[0];

      if (thetaDeg === undefined) {
        return;
      }

      const wrapped = ((thetaDeg % 360) + 360) % 360;
      void this.board.sendLine(`G92 X${wrapped.toFixed(4)}`).catch(() => undefined);
    });
    this.board.sendRealtime('?');
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
