/**
 * The part of an `mqtt` client the agent uses, so a test can stand in for the
 * broker. Deliberately the same shape as `MqttClientLike` in
 * `apps/api/src/device/hardware/mqtt-table-driver.ts`: both sides of the same
 * protocol talk to the same kind of client.
 */
export interface MqttPort {
  readonly connected: boolean;
  publishAsync(
    topic: string,
    message: string,
    options: { qos: 0 | 1; retain: boolean },
  ): Promise<unknown>;
  subscribeAsync(topics: string[], options: { qos: 1 }): Promise<unknown>;
  endAsync(force?: boolean): Promise<unknown>;
  on(event: 'connect' | 'close', listener: () => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  on(event: 'message', listener: (topic: string, payload: Buffer) => void): unknown;
}
