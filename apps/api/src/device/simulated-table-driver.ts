/**
 * The table driver used until real hardware exists.
 *
 * It stands in for the table's controller behind the `TableDriver` interface, so
 * everything above the driver (the job state machine, the HTTP API, the app) is
 * the production code path. It reports `mode: 'simulation'` on every status it
 * ever produces.
 *
 * How it behaves
 * --------------
 * - **Progress is a pure function of the clock.** For a job drawing at `now`,
 *   `progress = (now - startedAt - pausedTotal) / duration`, clamped to 0..1,
 *   where `duration = estimatedDuration / speedFactor`. Pausing stops the
 *   elapsed time from growing, so it freezes progress; resuming starts it again.
 *   No per-job timers exist, so nothing leaks between tests.
 * - **Progress is measured along the path.** The simulated table moves at a
 *   constant speed along the trajectory, so the fraction of time elapsed is the
 *   fraction of the path length drawn. `pointAtProgress` in `trajectory.ts`
 *   turns that fraction into a position.
 * - **State is settled lazily.** Completion and injected faults happen when the
 *   clock reaches them, but are noticed (and announced) the next time anything
 *   looks at the table: a command, a `getStatus`, or a scheduler `tick()`.
 * - **Events are ordered.** Every status change is delivered to subscribers in
 *   the order it happened, even if a listener calls back into the driver while
 *   being notified. A listener that throws does not stop other listeners or the
 *   driver.
 * - **Faults are deterministic.** Every Nth accepted job (counting across all
 *   tables) faults when it reaches a configured progress, ending with
 *   `SIMULATED_FAULT`. The same inputs always give the same outcome.
 *
 * State is in memory and per table, created on first use for any table id.
 */

import { Logger } from '@nestjs/common';
import type { Cancel, Clock, Scheduler } from './clock.js';
import {
  DriverError,
  InvalidDriverCommandError,
  type DriverConnection,
  type DriverErrorCode,
  type DriverEvent,
  type DriverPhase,
  type DriverStartRequest,
  type DriverStatus,
  type TableDriver,
  type TableMode,
  type Unsubscribe,
} from './table-driver.js';
import { describeTrajectoryProblems } from './trajectory.js';

/** Duration used when a start request does not say how long the drawing takes. */
export const DEFAULT_SIMULATED_DURATION_SECONDS = 60;

/** How often the scheduler re-evaluates active tables and announces progress. */
export const DEFAULT_TICK_INTERVAL_MS = 250;

/**
 * An injected fault never lets a job reach 1. A job's progress is 1 if and only
 * if it completed, so a fault asked for at 1 happens just before the end.
 */
export const FAULT_PROGRESS_CEILING = 0.999;

export interface SimulatedTableDriverOptions {
  readonly clock: Clock;
  readonly scheduler: Scheduler;
  /** Divides simulated durations. Must be positive. */
  readonly speedFactor: number;
  /** Every Nth accepted job faults; 0 disables injected faults. */
  readonly faultEveryNthJob: number;
  /** Progress, 0..1, at which an injected fault occurs. */
  readonly faultAtProgress: number;
  readonly tickIntervalMs?: number;
}

/** The part of a table's connection a test can force. */
export type SimulatedConnection = Extract<DriverConnection, 'online' | 'offline' | 'error'>;

type Listener = (event: DriverEvent) => void;

interface SimulatedJob {
  readonly jobId: string;
  readonly durationMs: number;
  readonly startedAt: number;
  /** Set while paused. */
  pausedAt: number | null;
  /** Total time spent paused, excluding the current pause. */
  pausedTotalMs: number;
  phase: DriverPhase;
  progress: number;
  errorCode: DriverErrorCode | null;
  /** Progress at which this job faults, or null if it never does. */
  readonly faultAtProgress: number | null;
}

interface TableState {
  connection: SimulatedConnection;
  job: SimulatedJob | null;
  /** The LED ambience shown, or null before one was set. */
  ambienceId: string | null;
  readonly listeners: Set<Listener>;
  /** Events waiting to be delivered, in order. */
  readonly queue: DriverEvent[];
  delivering: boolean;
  /** Fingerprint of the last event sent, so ticks announce only real changes. */
  lastAnnounced: string | null;
}

const ACTIVE_PHASES: readonly DriverPhase[] = ['drawing', 'paused'];

function isActive(job: SimulatedJob | null): job is SimulatedJob {
  return job !== null && ACTIVE_PHASES.includes(job.phase);
}

export class SimulatedTableDriver implements TableDriver {
  readonly mode: TableMode = 'simulation';

  private readonly logger = new Logger(SimulatedTableDriver.name);
  private readonly tables = new Map<string, TableState>();
  private readonly clock: Clock;
  private readonly scheduler: Scheduler;
  private readonly tickIntervalMs: number;
  private cancelTicking: Cancel | undefined;

  /** Jobs accepted so far, across all tables. Drives "every Nth job". */
  private acceptedJobs = 0;

  constructor(private readonly options: SimulatedTableDriverOptions) {
    this.clock = options.clock;
    this.scheduler = options.scheduler;
    this.tickIntervalMs = options.tickIntervalMs ?? DEFAULT_TICK_INTERVAL_MS;
  }

  // -------------------------------------------------------------------------
  // TableDriver
  // -------------------------------------------------------------------------

  getStatus(tableId: string): Promise<DriverStatus> {
    return this.run(() => {
      const state = this.stateOf(tableId);
      this.settle(tableId, state);

      return this.statusOf(tableId, state);
    });
  }

  startJob(tableId: string, request: DriverStartRequest): Promise<void> {
    return this.run(() => {
      const state = this.stateOf(tableId);
      this.settle(tableId, state);

      if (state.connection === 'offline') {
        throw new DriverError('OFFLINE', `Table ${tableId} is offline.`);
      }

      if (state.connection === 'error') {
        throw new DriverError('FAULT', `Table ${tableId} is reporting an error.`);
      }

      if (isActive(state.job)) {
        throw new DriverError('BUSY', `Table ${tableId} is already drawing.`);
      }

      const problems = describeTrajectoryProblems(request.trajectory);

      if (problems.length > 0) {
        throw new DriverError('TRAJECTORY_REJECTED', problems.join(' '));
      }

      const durationSeconds =
        request.estimatedDurationSeconds ?? DEFAULT_SIMULATED_DURATION_SECONDS;

      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        throw new DriverError(
          'TRAJECTORY_REJECTED',
          'estimatedDurationSeconds must be a positive number.',
        );
      }

      this.acceptedJobs += 1;

      const { faultEveryNthJob, faultAtProgress, speedFactor } = this.options;
      const faults = faultEveryNthJob > 0 && this.acceptedJobs % faultEveryNthJob === 0;

      state.job = {
        jobId: request.jobId,
        durationMs: (durationSeconds * 1000) / speedFactor,
        startedAt: this.clock.now(),
        pausedAt: null,
        pausedTotalMs: 0,
        phase: 'drawing',
        progress: 0,
        errorCode: null,
        faultAtProgress: faults ? Math.min(faultAtProgress, FAULT_PROGRESS_CEILING) : null,
      };

      this.announce(tableId, state, true);
    });
  }

  pause(tableId: string, jobId: string): Promise<void> {
    return this.run(() => {
      const { state, job } = this.activeJob(tableId, jobId, ['drawing'], 'pause');
      job.pausedAt = this.clock.now();
      job.phase = 'paused';

      this.announce(tableId, state, true);
    });
  }

  resume(tableId: string, jobId: string): Promise<void> {
    return this.run(() => {
      const { state, job } = this.activeJob(tableId, jobId, ['paused'], 'resume');
      const now = this.clock.now();

      job.pausedTotalMs += now - (job.pausedAt ?? now);
      job.pausedAt = null;
      job.phase = 'drawing';

      this.announce(tableId, state, true);
    });
  }

  stop(tableId: string, jobId: string): Promise<void> {
    return this.run(() => {
      const { state, job } = this.activeJob(tableId, jobId, ['drawing', 'paused'], 'stop');

      // Whatever has been drawn stays drawn: progress keeps its current value.
      job.pausedAt = null;
      job.phase = 'cancelled';

      this.announce(tableId, state, true);
    });
  }

  /** Stored and announced; a drawing in progress carries on. */
  setAmbience(tableId: string, ambienceId: string): Promise<void> {
    return this.run(() => {
      const state = this.stateOf(tableId);
      this.settle(tableId, state);

      if (state.connection !== 'online') {
        throw new DriverError(
          state.connection === 'offline' ? 'OFFLINE' : 'FAULT',
          `Table ${tableId} is ${state.connection}.`,
        );
      }

      state.ambienceId = ambienceId;
      this.announce(tableId, state, true);
    });
  }

  subscribe(tableId: string, listener: Listener): Unsubscribe {
    const { listeners } = this.stateOf(tableId);
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }

  // -------------------------------------------------------------------------
  // Time
  // -------------------------------------------------------------------------

  /**
   * Re-evaluate every active table at the clock's current time, announcing
   * completion, faults and progress. The scheduler calls this; tests call it
   * directly after moving a fake clock.
   */
  tick(): void {
    for (const [tableId, state] of this.tables) {
      if (!isActive(state.job)) {
        continue;
      }

      this.settle(tableId, state);

      if (isActive(state.job)) {
        this.announce(tableId, state, false);
      }
    }
  }

  /** Begin calling {@link tick} on the scheduler. Safe to call twice. */
  start(): void {
    this.cancelTicking ??= this.scheduler.every(this.tickIntervalMs, () => {
      this.tick();
    });
  }

  /** Stop ticking. Safe to call twice. */
  dispose(): void {
    this.cancelTicking?.();
    this.cancelTicking = undefined;
  }

  /** Whether the scheduler is currently driving {@link tick}. */
  get running(): boolean {
    return this.cancelTicking !== undefined;
  }

  /** Nest calls this when the application closes. */
  onModuleDestroy(): void {
    this.dispose();
  }

  // -------------------------------------------------------------------------
  // Test control
  // -------------------------------------------------------------------------

  /**
   * **Test only.** Force a table's connection, as if it dropped off the network
   * (`offline`), hit a fault (`error`), or recovered (`online`). It is not part
   * of `TableDriver`, so nothing above the driver can reach it.
   *
   * A job in progress when the table goes offline or into error fails, with
   * `OFFLINE` or `FAULT`, keeping the progress it had reached.
   */
  simulateConnection(tableId: string, connection: SimulatedConnection): void {
    const state = this.stateOf(tableId);
    this.settle(tableId, state);

    state.connection = connection;

    const { job } = state;

    if (isActive(job) && connection !== 'online') {
      job.pausedAt = null;
      job.phase = 'failed';
      job.errorCode = connection === 'offline' ? 'OFFLINE' : 'FAULT';
    }

    this.announce(tableId, state, true);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** Run synchronous work and report its outcome as a promise, as the interface asks. */
  private run<T>(work: () => T): Promise<T> {
    try {
      return Promise.resolve(work());
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private stateOf(tableId: string): TableState {
    let state = this.tables.get(tableId);

    if (state === undefined) {
      state = {
        connection: 'online',
        job: null,
        ambienceId: null,
        listeners: new Set(),
        queue: [],
        delivering: false,
        lastAnnounced: null,
      };
      this.tables.set(tableId, state);
    }

    return state;
  }

  /** Settle the table, then return its job if it is the active job with this id. */
  private activeJob(
    tableId: string,
    jobId: string,
    allowed: readonly DriverPhase[],
    command: string,
  ): { state: TableState; job: SimulatedJob } {
    const state = this.stateOf(tableId);
    this.settle(tableId, state);

    const { job } = state;

    if (job === null || job.jobId !== jobId) {
      throw new InvalidDriverCommandError(`Table ${tableId} is not running job ${jobId}.`);
    }

    if (!allowed.includes(job.phase)) {
      throw new InvalidDriverCommandError(
        `Cannot ${command} job ${jobId} on table ${tableId} while it is ${job.phase}.`,
      );
    }

    return { state, job };
  }

  /** Progress of a job at `now`, as a pure function of the clock. */
  private progressAt(job: SimulatedJob, now: number): number {
    const end = job.pausedAt ?? now;
    const elapsed = end - job.startedAt - job.pausedTotalMs;

    return Math.min(1, Math.max(0, elapsed / job.durationMs));
  }

  /**
   * Bring a table's job up to date with the clock: advance progress, and finish
   * the job if it has completed or reached its injected fault. Anything that
   * changed phase is announced.
   */
  private settle(tableId: string, state: TableState): void {
    const { job } = state;

    if (!isActive(job) || job.phase !== 'drawing') {
      return;
    }

    const progress = this.progressAt(job, this.clock.now());

    if (job.faultAtProgress !== null && progress >= job.faultAtProgress) {
      job.progress = job.faultAtProgress;
      job.phase = 'failed';
      job.errorCode = 'SIMULATED_FAULT';
      this.announce(tableId, state, true);
      return;
    }

    if (progress >= 1) {
      job.progress = 1;
      job.phase = 'completed';
      this.announce(tableId, state, true);
      return;
    }

    job.progress = progress;
  }

  private statusOf(tableId: string, state: TableState): DriverStatus {
    const { job } = state;
    const connection: DriverConnection =
      state.connection === 'online' ? (isActive(job) ? 'busy' : 'online') : state.connection;

    return {
      tableId,
      mode: this.mode,
      connection,
      phase: job?.phase ?? 'idle',
      jobId: job?.jobId ?? null,
      progress: job?.progress ?? 0,
      errorCode: job?.errorCode ?? null,
      ambienceId: state.ambienceId,
      observedAt: new Date(this.clock.now()).toISOString(),
    };
  }

  /**
   * Queue the table's current status for subscribers. With `force` false it is
   * skipped when nothing but the timestamp changed, so a tick on an unchanged
   * table is silent.
   */
  private announce(tableId: string, state: TableState, force: boolean): void {
    const status = this.statusOf(tableId, state);
    const fingerprint = [
      status.connection,
      status.phase,
      status.jobId,
      status.progress,
      status.errorCode,
      status.ambienceId,
    ].join('|');

    if (!force && fingerprint === state.lastAnnounced) {
      return;
    }

    state.lastAnnounced = fingerprint;
    state.queue.push(status);
    this.deliver(state);
  }

  /**
   * Deliver queued events in order. A listener that calls back into the driver
   * adds to the queue instead of re-entering delivery, which keeps events in
   * the order the changes happened.
   */
  private deliver(state: TableState): void {
    if (state.delivering) {
      return;
    }

    state.delivering = true;

    try {
      for (let event = state.queue.shift(); event !== undefined; event = state.queue.shift()) {
        for (const listener of [...state.listeners]) {
          try {
            listener(event);
          } catch (error) {
            this.logger.warn(
              `A status listener threw and was ignored: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }
    } finally {
      state.delivering = false;
    }
  }
}
