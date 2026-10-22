/**
 * Drawing jobs: the one place job state is written.
 *
 * What this service decides, and what it does not:
 *
 * - It owns every `DrawingJob`. Nothing else creates or changes one; the HTTP
 *   controllers and the driver both go through here.
 * - It does not know how a table moves sand. It asks the `TableDriver` to start,
 *   pause, resume and stop, and **listens to the driver's events**, applying each
 *   through the pure state machine (`job-state-machine.ts`).
 * - The driver says what the table is doing; this service decides what that means
 *   for the job. A report the machine has no transition for is logged and ignored.
 *
 * Concurrency: everything that can change a job runs one at a time, in order, in
 * `exclusive`. Commands hold it across their calls to the driver; driver events
 * that arrive meanwhile wait behind them and, finding the work already done,
 * change nothing. This is what makes a double tap, a tick during a command and a
 * stop racing a completion all come out in one consistent order. (The repository
 * is *also* atomic where it decides busy and repeat requests, so correctness never
 * rests on this lock alone.)
 *
 * Logging: job lifecycle lines carry the job id, the table id, the kind and design id, the
 * mode and states. There is no personal data on a job to log, and the client's
 * request id is not logged either.
 *
 * See docs/architecture.md, sections 4 and 5.
 */

import { Inject, Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import {
  featuresFor,
  isActiveJobState,
  type DrawingJob,
  type Feature,
  type JobErrorCode,
  type JobTrigger,
  type StartJobRequest,
  type TableGeometry,
} from '@athar/contracts';
import type { Authenticated } from '../auth/auth.service.js';
import { DomainException } from '../common/http/domain.exception.js';
import { CLOCK, type Clock } from '../device/clock.js';
import {
  DriverError,
  InvalidDriverCommandError,
  TABLE_DRIVER,
  type DriverStatus,
  type TableDriver,
  type Unsubscribe,
} from '../device/table-driver.js';
import { DesignsService, type DrawingPlan } from '../designs/designs.service.js';
import { PairingStore } from '../tables/pairing-store.js';
import { TableRegistry } from '../tables/table-registry.service.js';
import type { ActiveJobLookup } from '../tables/active-job-lookup.js';
import {
  applyDriverStatus,
  applyTrigger,
  describeRejectedCommand,
  transition,
  type JobCommand,
} from './job-state-machine.js';
import { JOB_REPOSITORY, type JobRepository } from './job-repository.js';

/** The feature each kind of start needs from the table's plan (decision D3). */
const FEATURE_FOR_START = {
  design: 'catalogue',
  path: 'drawingPen',
  rake: 'rake',
} as const satisfies Record<StartJobRequest['kind'], Feature>;

/**
 * What a start asked for, in a form two requests can be compared by: the design
 * id, the rake, or a SHA-256 of the path as parsed (same points, same hash).
 */
function fingerprintOf(request: StartJobRequest): string {
  switch (request.kind) {
    case 'design':
      return `design:${request.designId}`;
    case 'path':
      return `path:${createHash('sha256').update(JSON.stringify(request.path)).digest('hex')}`;
    case 'rake':
      return 'rake';
  }
}

export interface StartedJob {
  readonly job: DrawingJob;
  /** True for a new job (`201`), false when the request repeated an earlier one (`200`). */
  readonly created: boolean;
}

@Injectable()
export class JobsService implements ActiveJobLookup, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private readonly subscriptions = new Map<string, Unsubscribe>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    @Inject(JOB_REPOSITORY) private readonly jobs: JobRepository,
    @Inject(TABLE_DRIVER) private readonly driver: TableDriver,
    private readonly tables: TableRegistry,
    private readonly designs: DesignsService,
    @Inject(CLOCK) private readonly clock: Clock,
    private readonly pairings: PairingStore,
  ) {}

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /** @throws DomainException `JOB_NOT_FOUND` */
  async get(jobId: string): Promise<DrawingJob> {
    const job = await this.jobs.get(jobId);

    if (job === undefined) {
      throw new DomainException('JOB_NOT_FOUND', `No job with id ${jobId}.`);
    }

    return job;
  }

  /**
   * The table's recent jobs, newest first.
   *
   * @throws DomainException `TABLE_NOT_FOUND`
   */
  async listForTable(tableId: string, limit: number): Promise<readonly DrawingJob[]> {
    await this.tables.get(tableId);

    return this.jobs.listRecent(tableId, limit);
  }

  /**
   * The seam `tables` reads: which job, if any, is running on a table.
   *
   * Read in `exclusive`, so a driver event queued just before (a completion the
   * caller's `getStatus` settled, say) is applied first and a finished job is
   * not reported as active. Never call it from inside `exclusive`: the queue is
   * not reentrant, so that would wait for itself forever.
   */
  activeJobIdFor(tableId: string): Promise<string | null> {
    return this.exclusive(async () => (await this.jobs.findActive(tableId))?.id ?? null);
  }

  // -------------------------------------------------------------------------
  // Start
  // -------------------------------------------------------------------------

  /**
   * Start a drawing, or return the one an earlier identical request started.
   *
   * Checked in the documented order, first failure wins, all inside `exclusive`
   * so nothing changes between the checks and the driver call: the caller owns
   * the table, the design exists, the request is not a repeat, then the drawing
   * conditions: the table is enabled, this session is paired with it, it is
   * online, it is free, and its plan includes the feature the request's kind
   * needs. Only then is a freehand path joined up and checked.
   *
   * A repeat returns the original job without checking the conditions again, so
   * a retry after a lost response never fails because the pairing lapsed or the
   * job is now holding the table.
   *
   * If the driver refuses the job (`DriverError`), the job exists and is `failed`
   * with the driver's error code, and that job is returned: the app shows it like
   * any other failure. A new job extends the session's pairing.
   *
   * @throws DomainException `TABLE_NOT_FOUND`, `DESIGN_NOT_FOUND`,
   *   `IDEMPOTENCY_CONFLICT`, `TABLE_DISABLED`, `PAIRING_REQUIRED`,
   *   `TABLE_OFFLINE`, `TABLE_BUSY`, `FEATURE_NOT_IN_PLAN`, and
   *   `VALIDATION_FAILED` for a path that cannot be drawn
   */
  start(tableId: string, request: StartJobRequest, caller: Authenticated): Promise<StartedJob> {
    return this.exclusive(async () => {
      const table = await this.tables.getFor(tableId, caller.account, 'command');
      const design = request.kind === 'design' ? this.designs.get(request.designId) : undefined;
      const fingerprint = fingerprintOf(request);

      const earlier = await this.jobs.findByClientRequestId(tableId, request.clientRequestId);

      if (earlier !== undefined) {
        return this.repeat(earlier, fingerprint);
      }

      if (!table.enabled) {
        throw new DomainException('TABLE_DISABLED', `Table ${tableId} is switched off.`);
      }

      this.requirePairing(caller, tableId);

      const status = await this.driver.getStatus(tableId);

      if (status.connection === 'offline' || status.connection === 'error') {
        throw new DomainException('TABLE_OFFLINE', `Table ${tableId} is ${status.connection}.`);
      }

      if ((await this.jobs.findActive(tableId)) !== undefined) {
        throw tableBusy(tableId);
      }

      const feature = FEATURE_FOR_START[request.kind];

      if (!featuresFor(table).includes(feature)) {
        throw new DomainException(
          'FEATURE_NOT_IN_PLAN',
          `The plan of table ${tableId} does not include ${feature}.`,
        );
      }

      // Built last: a freehand path is joined up and checked here (`VALIDATION_FAILED`).
      const plan: DrawingPlan =
        design !== undefined
          ? {
              trajectory: this.designs.getTrajectory(design.id),
              estimatedDurationSeconds: design.estimatedDurationSeconds,
            }
          : request.kind === 'path'
            ? this.designs.freehand(request.path)
            : this.designs.rake();

      const now = this.now();
      const job: DrawingJob = {
        id: randomUUID(),
        tableId,
        kind: request.kind,
        designId: design?.id ?? null,
        mode: this.driver.mode,
        state: 'queued',
        progress: 0,
        createdAt: now,
        startedAt: null,
        updatedAt: now,
        finishedAt: null,
        errorCode: null,
      };

      const inserted = await this.jobs.insertIfNoActive(job, request.clientRequestId, fingerprint);

      if (inserted.kind === 'replayed') {
        return this.repeat(inserted.job, fingerprint);
      }

      // Checked above too; the repository decides it atomically all the same.
      if (inserted.kind === 'busy') {
        throw tableBusy(tableId);
      }

      this.pairings.pair(caller.sessionId, tableId);
      this.logger.log(
        `Job ${job.id} queued on table ${tableId} (${job.kind}${job.designId === null ? '' : ` ${job.designId}`}, ${job.mode})`,
      );
      this.listenTo(tableId);

      return { job: await this.hand(job, plan, table.geometry), created: true };
    });
  }

  /** The answer to a request that repeats an earlier one. */
  private async repeat(earlier: DrawingJob, fingerprint: string): Promise<StartedJob> {
    if ((await this.jobs.fingerprintOf(earlier.id)) !== fingerprint) {
      throw new DomainException(
        'IDEMPOTENCY_CONFLICT',
        'This request id was already used for a different drawing.',
      );
    }

    return { job: earlier, created: false };
  }

  /** Give a queued job to the driver, and settle what happens next. */
  private async hand(
    job: DrawingJob,
    plan: DrawingPlan,
    geometry: TableGeometry,
  ): Promise<DrawingJob> {
    try {
      await this.driver.startJob(job.tableId, { jobId: job.id, ...plan, geometry });
    } catch (error) {
      if (error instanceof DriverError) {
        return this.fail(job, error.code, `the driver refused it (${error.code})`);
      }

      // Something unexpected: never leave the job holding the table.
      await this.fail(job, 'FAULT', 'the driver failed unexpectedly');
      throw error;
    }

    return this.settle(job, 'driver-accepted');
  }

  // -------------------------------------------------------------------------
  // Commands
  // -------------------------------------------------------------------------

  /** The caller's ownership of the job's table is checked by the controller. */
  pause(jobId: string, caller: Authenticated): Promise<DrawingJob> {
    return this.command(jobId, 'pause', caller);
  }

  resume(jobId: string, caller: Authenticated): Promise<DrawingJob> {
    return this.command(jobId, 'resume', caller);
  }

  stop(jobId: string, caller: Authenticated): Promise<DrawingJob> {
    return this.command(jobId, 'stop', caller);
  }

  /**
   * Run a command on a job.
   *
   * Pause and resume need the caller's session to be paired with the job's
   * table. Stop does not: it is the safety action, so the owner can always end a
   * drawing. A successful command extends the pairing, if there is one.
   *
   * The driver is asked first what the table is really doing, so the command is
   * judged against fresh state; then the job's state is judged by the machine; then
   * the driver is told; then the new state is read back from the driver.
   *
   * @throws DomainException `JOB_NOT_FOUND`, `PAIRING_REQUIRED`, `INVALID_TRANSITION`
   */
  private command(jobId: string, command: JobCommand, caller: Authenticated): Promise<DrawingJob> {
    return this.exclusive(async () => {
      const found = await this.get(jobId);
      if (command !== 'stop') {
        this.requirePairing(caller, found.tableId);
      }
      let job = await this.refreshed(found);

      if (!transition(job.state, command).ok) {
        throw this.invalid(command, job);
      }

      try {
        await this.driver[command](job.tableId, job.id);
      } catch (error) {
        if (error instanceof InvalidDriverCommandError) {
          // The table moved on (it finished, say) since we last heard from it.
          job = await this.refreshed(await this.get(jobId));
          throw this.invalid(command, job);
        }

        throw error;
      }

      job = await this.refreshed(await this.get(jobId));
      if (this.pairings.isPaired(caller.sessionId, job.tableId)) {
        this.pairings.pair(caller.sessionId, job.tableId);
      }

      // A driver that has not yet reported the change in its status: trust the command.
      return isActiveJobState(job.state) && transition(job.state, command).ok
        ? this.settle(job, command)
        : job;
    });
  }

  /** @throws DomainException `PAIRING_REQUIRED` */
  private requirePairing(caller: Authenticated, tableId: string): void {
    if (!this.pairings.isPaired(caller.sessionId, tableId)) {
      throw new DomainException(
        'PAIRING_REQUIRED',
        `Pair with table ${tableId} first (POST /api/v1/tables/${tableId}/pairing).`,
      );
    }
  }

  private invalid(command: JobCommand, job: DrawingJob): DomainException {
    return new DomainException('INVALID_TRANSITION', describeRejectedCommand(command, job.state));
  }

  // -------------------------------------------------------------------------
  // Driver events
  // -------------------------------------------------------------------------

  /** Start hearing about a table, once. */
  private listenTo(tableId: string): void {
    if (this.subscriptions.has(tableId)) {
      return;
    }

    this.subscriptions.set(
      tableId,
      this.driver.subscribe(tableId, (event) => {
        // Delivered in order, applied in order, never in the middle of a command.
        void this.exclusive(() => this.onDriverStatus(event)).catch((error: unknown) => {
          this.logger.error(
            `Could not apply a driver event for table ${tableId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      }),
    );
  }

  private async onDriverStatus(status: DriverStatus): Promise<void> {
    if (status.jobId === null) {
      return;
    }

    const job = await this.jobs.get(status.jobId);

    if (job !== undefined) {
      await this.apply(job, status);
    }
  }

  /** Ask the driver what the table is doing and apply it to an active job. */
  private async refreshed(job: DrawingJob): Promise<DrawingJob> {
    if (!isActiveJobState(job.state)) {
      return job;
    }

    return this.apply(job, await this.driver.getStatus(job.tableId));
  }

  /** Apply a driver status to a job through the state machine, store and log the change. */
  private async apply(job: DrawingJob, status: DriverStatus): Promise<DrawingJob> {
    const outcome = applyDriverStatus(job, status, this.now());

    if (outcome.rejected !== undefined) {
      this.logger.warn(`Job ${job.id}: ${outcome.rejected} Ignored.`);
    }

    if (!outcome.changed) {
      return job;
    }

    await this.jobs.update(outcome.job);
    this.logChange(job, outcome.job);

    return outcome.job;
  }

  // -------------------------------------------------------------------------
  // Applying a transition ourselves
  // -------------------------------------------------------------------------

  /** Apply a trigger to a job, from a command or an accepted start. */
  private async settle(job: DrawingJob, trigger: JobTrigger): Promise<DrawingJob> {
    const fresh = (await this.jobs.get(job.id)) ?? job;
    const next = applyTrigger(fresh, trigger, this.now());

    if (next === undefined) {
      return fresh;
    }

    await this.jobs.update(next);
    this.logChange(fresh, next);

    return next;
  }

  /** End a job as failed. Used when the driver cannot take it. */
  private async fail(job: DrawingJob, errorCode: JobErrorCode, why: string): Promise<DrawingJob> {
    const fresh = (await this.jobs.get(job.id)) ?? job;
    const trigger = fresh.state === 'queued' ? 'driver-rejected' : 'driver-fault';
    const next = applyTrigger(fresh, trigger, this.now(), { errorCode });

    if (next === undefined) {
      return fresh;
    }

    await this.jobs.update(next);
    this.logger.warn(`Job ${job.id} on table ${job.tableId} failed: ${why}`);

    return next;
  }

  private logChange(before: DrawingJob, after: DrawingJob): void {
    if (before.state === after.state) {
      return;
    }

    this.logger.log(
      `Job ${after.id} on table ${after.tableId}: ${before.state} -> ${after.state}` +
        (after.errorCode === null ? '' : ` (${after.errorCode})`),
    );
  }

  // -------------------------------------------------------------------------
  // Plumbing
  // -------------------------------------------------------------------------

  private now(): string {
    return new Date(this.clock.now()).toISOString();
  }

  /** Run `work` after everything before it has finished, and before anything after it. */
  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work);
    this.queue = result.catch(() => undefined);

    return result;
  }

  /** Resolves once everything queued so far has been applied. For tests and shutdown. */
  async whenIdle(): Promise<void> {
    await this.queue;
  }

  onModuleDestroy(): void {
    for (const unsubscribe of this.subscriptions.values()) {
      unsubscribe();
    }

    this.subscriptions.clear();
  }
}

function tableBusy(tableId: string): DomainException {
  return new DomainException('TABLE_BUSY', `Table ${tableId} already has an active job.`);
}
