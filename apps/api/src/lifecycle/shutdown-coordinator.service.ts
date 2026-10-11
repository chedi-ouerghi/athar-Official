/**
 * Owns process signal handling for a clean shutdown.
 *
 * Nest's shutdown hooks stop the HTTP server and let in-flight requests finish.
 * This service adds the missing safety net: once a termination signal arrives,
 * a bounded grace period starts, after which the process exits regardless. A
 * hung connection therefore cannot keep a container alive forever.
 */

import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';

/** Signals treated as a request to terminate. */
const TERMINATION_SIGNALS = ['SIGINT', 'SIGTERM'] as const;

@Injectable()
export class ShutdownCoordinator implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ShutdownCoordinator.name);

  /** Guards against a signal arriving twice and arming two watchdogs. */
  private watchdog: NodeJS.Timeout | undefined;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  onModuleInit(): void {
    for (const signal of TERMINATION_SIGNALS) {
      process.on(signal, this.onTerminationSignal);
    }
  }

  onModuleDestroy(): void {
    for (const signal of TERMINATION_SIGNALS) {
      process.off(signal, this.onTerminationSignal);
    }

    this.disarmWatchdog();
  }

  private readonly onTerminationSignal = (signal: NodeJS.Signals): void => {
    if (this.watchdog !== undefined) {
      return;
    }

    this.logger.warn(
      `Received ${signal}. Draining connections for up to ${this.config.shutdownTimeoutMs}ms.`,
    );

    this.watchdog = setTimeout(() => {
      this.logger.error(
        `Shutdown exceeded ${this.config.shutdownTimeoutMs}ms. Forcing process exit.`,
      );
      process.exit(1);
    }, this.config.shutdownTimeoutMs);

    // Never hold the event loop open on the watchdog's account.
    this.watchdog.unref();
  };

  private disarmWatchdog(): void {
    if (this.watchdog === undefined) {
      return;
    }

    clearTimeout(this.watchdog);
    this.watchdog = undefined;
  }
}
