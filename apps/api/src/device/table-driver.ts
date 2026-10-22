/**
 * The only way the rest of the API reaches a table.
 *
 * The interface is expressed in domain terms. It names no serial port, broker,
 * controller firmware, G-code dialect or transport, so it cannot only be
 * implemented for one of them. `SimulatedTableDriver` implements it for
 * development and `MqttTableDriver` for real tables; nothing above the driver
 * changes with the mode.
 *
 * The command path is: phone -> backend (over the internet) -> table
 * controller. This interface is the backend's side of the last arrow, and the
 * simulator stands in for the controller until a real one exists.
 *
 * See docs/architecture.md, section 2.
 */

import type {
  DriverConnection,
  DriverErrorCode,
  DriverPhase,
  DriverStatus,
  Light,
  TableGeometry,
  TableMode,
} from '@athar/contracts';
import type { Trajectory } from './trajectory.js';

// The shared vocabulary lives in `@athar/contracts`, so the values a driver
// reports and the values the HTTP API returns cannot drift apart.
export type { DriverConnection, DriverErrorCode, DriverPhase, DriverStatus, TableMode };

/** Progress and status changes are the same shape: a new snapshot. */
export type DriverEvent = DriverStatus;

export type Unsubscribe = () => void;

/**
 * Raised when a table refuses a command or cannot carry it out.
 *
 * The code is transport-neutral. Transport specifics (a serial timeout, a lost
 * broker connection) are mapped to a code inside the implementation and logged
 * there; they never cross this interface.
 */
export class DriverError extends Error {
  constructor(
    readonly code: DriverErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'DriverError';
  }
}

/**
 * Raised when a command names a job the table is not running, or asks for
 * something the job's phase does not allow (pausing a finished job).
 *
 * It is deliberately not a `DriverError`: that type means "the table failed",
 * and carries a code a job can end with. This one means the caller sent a
 * command that makes no sense, which the job state machine should have
 * prevented, so it is a programming error to be fixed, not a table outcome.
 */
export class InvalidDriverCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDriverCommandError';
  }
}

/**
 * Named for the driver side, to keep it apart from `StartJobRequest` in
 * `@athar/contracts`, which is the HTTP request body.
 */
export interface DriverStartRequest {
  /** Chosen by the API; the driver echoes it in every status it emits. */
  readonly jobId: string;
  readonly trajectory: Trajectory;
  /**
   * The table's shape and size, for a hardware driver to scale the normalised
   * trajectory to it. The simulator ignores it.
   */
  readonly geometry?: TableGeometry;
  /**
   * How long the drawing is expected to take. The simulator paces itself with
   * it; a hardware driver ignores it, because a real table takes as long as it
   * takes. Optional so that the request describes only what the table needs.
   */
  readonly estimatedDurationSeconds?: number;
}

export interface TableDriver {
  /** Fixed for the lifetime of the driver; equals `mode` in every status it emits. */
  readonly mode: TableMode;

  getStatus(tableId: string): Promise<DriverStatus>;

  /** Resolves once the table has accepted the job. Rejects with `DriverError`. */
  startJob(tableId: string, request: DriverStartRequest): Promise<void>;

  pause(tableId: string, jobId: string): Promise<void>;
  resume(tableId: string, jobId: string): Promise<void>;
  /** Aborts the job. Whatever has been drawn stays drawn; it is not undone. */
  stop(tableId: string, jobId: string): Promise<void>;

  /**
   * Show an LED ambience. Independent of drawing: it may change while a job runs.
   * The id is one the API has checked; the driver maps it to its own colours.
   * Rejects with `DriverError` (`OFFLINE`, `FAULT`) when the table cannot take it.
   */
  setAmbience(tableId: string, ambienceId: string): Promise<void>;

  /**
   * Set the light: off, on, any colour at a brightness, or a named ambience.
   * Same rules as {@link setAmbience}, which is `setLight` with a `preset`.
   */
  setLight(tableId: string, light: Light): Promise<void>;

  /**
   * Receive every status change and progress update for one table, in order.
   * Returns a function that ends the subscription.
   */
  subscribe(tableId: string, listener: (event: DriverEvent) => void): Unsubscribe;
}

/** Dependency-injection token for the bound {@link TableDriver}. */
export const TABLE_DRIVER = Symbol('TABLE_DRIVER');
