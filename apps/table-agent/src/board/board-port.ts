/**
 * What the agent needs from the controller board (a FluidNC-flashed DLC32 or
 * ESP32, talked to over USB serial at 115200 baud). The interface names no
 * transport, so `FakeBoardPort` can stand in for it in tests without a real
 * board plugged in — the N0 CI level of `hardware/TESTING.md`.
 *
 * FluidNC answers queued G-code lines strictly in the order it received
 * them (`ok` / `error:<n>`, one per line), which is why {@link BoardPort.sendLine}
 * can simply correlate to the next reply rather than needing a per-line id.
 * Realtime single-byte commands (`?`, `!`, `~`, soft reset) are answered
 * out of band and never consume a queued line's reply slot.
 */

import type { StatusReport } from './status-report.js';

export type Unsubscribe = () => void;

/** The board discarded whatever it had queued (a soft reset), so a pending `sendLine` can never be answered. */
export class BoardCancelledError extends Error {
  constructor(message = 'The board queue was reset before this line was answered.') {
    super(message);
    this.name = 'BoardCancelledError';
  }
}

/** The board replied `error:<code>` to a line. */
export class BoardLineError extends Error {
  constructor(readonly code: string) {
    super(`The board rejected the line with error:${code}.`);
    this.name = 'BoardLineError';
  }
}

export interface BoardPort {
  readonly isOpen: boolean;

  open(): Promise<void>;
  close(): Promise<void>;

  /**
   * Sends one G-code line (no trailing newline) and resolves on the board's
   * next `ok`, or rejects with {@link BoardLineError} on `error:` or
   * {@link BoardCancelledError} if {@link cancelPending} is called first.
   */
  sendLine(line: string): Promise<void>;

  /** Fire-and-forget realtime byte: `'?'`, `'!'` (hold), `'~'` (resume), `'\x18'` (soft reset). */
  sendRealtime(byte: string): void;

  /**
   * Rejects every `sendLine` currently awaiting a reply with
   * {@link BoardCancelledError}. Call right after a soft reset: the board will
   * never answer lines it just discarded.
   */
  cancelPending(): void;

  /** Fired for every realtime status report (`?` replies with one). */
  onStatus(listener: (report: StatusReport) => void): Unsubscribe;

  /** Fired for an asynchronous `ALARM:` push (not a reply to a sent line). */
  onAlarm(listener: (code: string) => void): Unsubscribe;

  /** Fired for an informational `[MSG:...]` banner, e.g. at startup. */
  onMessage(listener: (text: string) => void): Unsubscribe;

  /** Fired once if the transport is lost unexpectedly (cable unplugged, read error). */
  onDisconnect(listener: (error: Error) => void): Unsubscribe;
}
