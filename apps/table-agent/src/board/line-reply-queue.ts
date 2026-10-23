/**
 * FIFO correlation between sent G-code lines and the board's replies.
 * FluidNC answers lines strictly in the order received, so the next `ok` or
 * `error:` always belongs to the oldest unanswered line. Shared by
 * `SerialBoardPort` and `FakeBoardPort` so both implement
 * `BoardPort.sendLine` / `BoardPort.cancelPending` the same way.
 */

import { BoardCancelledError, BoardLineError } from './board-port.js';

interface PendingReply {
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
}

export interface EnqueuedReply {
  readonly promise: Promise<void>;
  /** For a line that never reached the board (a write failure): settles only this entry, not the head. */
  readonly cancel: (error: Error) => void;
}

export class LineReplyQueue {
  private readonly pending: PendingReply[] = [];

  get size(): number {
    return this.pending.length;
  }

  enqueue(): EnqueuedReply {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const entry: PendingReply = { resolve, reject };
    this.pending.push(entry);

    return {
      promise,
      cancel: (error) => {
        const index = this.pending.indexOf(entry);

        if (index !== -1) {
          this.pending.splice(index, 1);
          reject(error);
        }
      },
    };
  }

  resolveNextOk(): void {
    this.pending.shift()?.resolve();
  }

  rejectNextError(code: string): void {
    this.pending.shift()?.reject(new BoardLineError(code));
  }

  /** Rejects everything waiting (a soft reset, an alarm, or the transport being lost). */
  cancelAll(error: Error = new BoardCancelledError()): void {
    const waiting = this.pending.splice(0, this.pending.length);

    for (const entry of waiting) {
      entry.reject(error);
    }
  }
}
