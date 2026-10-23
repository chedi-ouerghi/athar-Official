/**
 * Real `BoardPort`: a FluidNC controller over USB serial. Lines are
 * delimited by `\r\n` (FluidNC's own line ending); `classifyBoardLine` turns
 * each one into `ok` / `error:` / `ALARM:` / a realtime report / a banner.
 */

import { ReadlineParser } from '@serialport/parser-readline';
import { SerialPort } from 'serialport';
import { type BoardPort, type Unsubscribe } from './board-port.js';
import { LineReplyQueue } from './line-reply-queue.js';
import { ListenerSet } from './listener-set.js';
import { classifyBoardLine, type StatusReport } from './status-report.js';

export interface SerialBoardPortOptions {
  readonly path: string;
  readonly baudRate: number;
}

export class SerialBoardPort implements BoardPort {
  private readonly options: SerialBoardPortOptions;
  private port: SerialPort | null = null;
  private readonly queue = new LineReplyQueue();
  private readonly statusListeners = new ListenerSet<StatusReport>();
  private readonly alarmListeners = new ListenerSet<string>();
  private readonly messageListeners = new ListenerSet<string>();
  private readonly disconnectListeners = new ListenerSet<Error>();

  constructor(options: SerialBoardPortOptions) {
    this.options = options;
  }

  get isOpen(): boolean {
    return this.port?.isOpen ?? false;
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      const port = new SerialPort(
        { path: this.options.path, baudRate: this.options.baudRate, autoOpen: true },
        (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        },
      );

      const parser = port.pipe(new ReadlineParser({ delimiter: '\r\n' }));
      parser.on('data', (line: string) => {
        this.onLine(line);
      });

      port.on('error', (error: Error) => {
        this.disconnectListeners.emit(error);
        this.queue.cancelAll(error);
      });
      port.on('close', () => {
        const error = new Error('The serial port closed unexpectedly.');
        this.disconnectListeners.emit(error);
        this.queue.cancelAll(error);
      });

      this.port = port;
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.port === null || !this.port.isOpen) {
        resolve();
        return;
      }

      this.port.close((error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  sendLine(line: string): Promise<void> {
    if (this.port === null || !this.port.isOpen) {
      return Promise.reject(new Error('Board is not open.'));
    }

    const entry = this.queue.enqueue();

    this.port.write(`${line}\n`, (error) => {
      if (error) {
        entry.cancel(error);
      }
    });

    return entry.promise;
  }

  sendRealtime(byte: string): void {
    this.port?.write(byte);
  }

  cancelPending(): void {
    this.queue.cancelAll();
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

  private onLine(raw: string): void {
    const line = classifyBoardLine(raw);

    switch (line.kind) {
      case 'ok':
        this.queue.resolveNextOk();
        break;
      case 'error':
        this.queue.rejectNextError(line.code);
        break;
      case 'alarm':
        // An ALARM discards whatever FluidNC had queued; nothing we sent will
        // ever be answered now.
        this.queue.cancelAll();
        this.alarmListeners.emit(line.code);
        break;
      case 'status':
        this.statusListeners.emit(line.report);
        break;
      case 'message':
        this.messageListeners.emit(line.text);
        break;
      case 'other':
        // Unrecognised banner/echo lines (e.g. `$I` version info): surfaced as
        // messages too, so `selftest` can show them without the agent caring.
        this.messageListeners.emit(line.text);
        break;
    }
  }
}
