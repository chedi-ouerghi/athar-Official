import { EventEmitter } from 'node:events';
import type { MqttClientLike } from './mqtt-table-driver.js';

/**
 * Stands in for the broker connection in tests (the way `FakeClock` stands in for
 * time). Messages the driver publishes are recorded; tests make the "table"
 * speak by emitting `message`.
 */
export class FakeMqttClient extends EventEmitter implements MqttClientLike {
  connected = true;
  ended = false;
  publishError: Error | null = null;
  readonly published: { topic: string; message: string; options: unknown }[] = [];
  readonly subscriptions: string[][] = [];

  publishAsync(topic: string, message: string, options: unknown): Promise<unknown> {
    if (this.publishError !== null) {
      return Promise.reject(this.publishError);
    }

    this.published.push({ topic, message, options });

    return Promise.resolve();
  }

  subscribeAsync(requested: string[]): Promise<unknown> {
    this.subscriptions.push(requested);

    return Promise.resolve();
  }

  endAsync(): Promise<unknown> {
    this.ended = true;
    this.connected = false;

    return Promise.resolve();
  }
}
