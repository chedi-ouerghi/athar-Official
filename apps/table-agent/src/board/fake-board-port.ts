/**
 * Stands in for a real FluidNC controller in tests (N0 of `hardware/TESTING.md`):
 * answers `ok` to G-code, tracks a simulated position, answers `?` with a
 * realtime report, and can simulate every fault the guide asks for —
 * `error:`, `ALARM:`, a slow reply, and a disconnected cable.
 */

import { BoardCancelledError, type BoardPort, type Unsubscribe } from './board-port.js';
import { LineReplyQueue } from './line-reply-queue.js';
import { ListenerSet } from './listener-set.js';
import type { StatusReport } from './status-report.js';

export type FakeBoardFault =
  | { readonly kind: 'error'; readonly code?: string }
  | { readonly kind: 'alarm'; readonly code?: string }
  | { readonly kind: 'disconnect' }
  | { readonly kind: 'slow'; readonly delayMs?: number };

const MOVE_PATTERN = /^G1\b.*?X([-\d.]+).*?Y([-\d.]+)/;
const G92_PATTERN = /^G92\s+X([-\d.]+)/;

export class FakeBoardPort implements BoardPort {
  private open_ = false;
  private readonly queue = new LineReplyQueue();
  private readonly statusListeners = new ListenerSet<StatusReport>();
  private readonly alarmListeners = new ListenerSet<string>();
  private readonly messageListeners = new ListenerSet<string>();
  private readonly disconnectListeners = new ListenerSet<Error>();
  private readonly pendingFaults: FakeBoardFault[] = [];
  private state: 'Idle' | 'Hold' | 'Alarm' = 'Idle';
  private mposX = 0;
  private mposY = 0;

  get isOpen(): boolean {
    return this.open_;
  }

  /** Current simulated position, for test assertions. */
  get position(): readonly [number, number] {
    return [this.mposX, this.mposY];
  }

  /** The next `sendLine` consumes one queued fault instead of behaving normally. */
  queueFault(fault: FakeBoardFault): void {
    this.pendingFaults.push(fault);
  }

  open(): Promise<void> {
    this.open_ = true;

    return Promise.resolve();
  }

  close(): Promise<void> {
    this.open_ = false;

    return Promise.resolve();
  }

  sendLine(line: string): Promise<void> {
    if (!this.open_) {
      return Promise.reject(new Error('Board is not open.'));
    }

    const entry = this.queue.enqueue();
    const fault = this.pendingFaults.shift();

    if (fault?.kind === 'slow') {
      setTimeout(() => {
        this.applyLine(line);
        this.queue.resolveNextOk();
      }, fault.delayMs ?? 500);

      return entry.promise;
    }

    queueMicrotask(() => {
      if (fault?.kind === 'error') {
        this.queue.rejectNextError(fault.code ?? '1');
      } else if (fault?.kind === 'alarm') {
        this.state = 'Alarm';
        this.alarmListeners.emit(fault.code ?? '1');
        this.queue.cancelAll();
      } else if (fault?.kind === 'disconnect') {
        this.open_ = false;
        this.disconnectListeners.emit(new Error('Simulated cable disconnect.'));
        this.queue.cancelAll(new Error('Board disconnected.'));
      } else {
        this.applyLine(line);
        this.queue.resolveNextOk();
      }
    });

    return entry.promise;
  }

  sendRealtime(byte: string): void {
    if (byte === '?') {
      this.statusListeners.emit({ state: this.state, mpos: [this.mposX, this.mposY, 0], pins: null });
    } else if (byte === '!') {
      this.state = 'Hold';
    } else if (byte === '~') {
      this.state = this.state === 'Alarm' ? 'Alarm' : 'Idle';
    } else if (byte === '\x18') {
      this.state = 'Idle';
      this.queue.cancelAll();
    }
  }

  cancelPending(): void {
    this.queue.cancelAll(new BoardCancelledError());
  }

  onStatus(listener: (report: StatusReport) => void): Unsubscribe {
    return this.statusListeners.add(listener);
  }

  onAlarm(listener: (code: string) => void): Unsubscribe {
    return this.alarmListeners.add(listener);
  }

  onMessage(listener: (text: string) => void): Unsubscribe {
    return this.messageListeners.add(listener);
  }

  onDisconnect(listener: (error: Error) => void): Unsubscribe {
    return this.disconnectListeners.add(listener);
  }

  private applyLine(line: string): void {
    const trimmed = line.trim();

    if (trimmed === '$H') {
      this.mposX = 0;
      this.mposY = 0;
      this.state = 'Idle';
      return;
    }

    const g92 = G92_PATTERN.exec(trimmed);

    if (g92?.[1] !== undefined) {
      this.mposX = Number(g92[1]);
      return;
    }

    const move = MOVE_PATTERN.exec(trimmed);

    if (move?.[1] !== undefined && move[2] !== undefined) {
      this.mposX += Number(move[1]);
      this.mposY += Number(move[2]);
    }
  }
}
