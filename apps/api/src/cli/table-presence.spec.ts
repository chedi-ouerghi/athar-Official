import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  publishTablePresence,
  TABLE_PRESENCE_ID,
  TABLE_PRESENCE_TOPIC,
  type PresenceMqttClient,
} from './table-presence.js';

class FakeMqttClient extends EventEmitter implements PresenceMqttClient {
  connected = false;
  readonly publishAsync = vi.fn<PresenceMqttClient['publishAsync']>();
  readonly endAsync = vi.fn<PresenceMqttClient['endAsync']>();

  constructor() {
    super();
    this.publishAsync.mockResolvedValue(undefined);
    this.endAsync.mockResolvedValue(undefined);
  }
}

describe('publishTablePresence', () => {
  it('publishes the retained online status at QoS 1 after connecting, then closes', async () => {
    const client = new FakeMqttClient();
    const published = publishTablePresence(client);

    expect(client.publishAsync).not.toHaveBeenCalled();

    client.emit('connect');
    await published;

    expect(TABLE_PRESENCE_ID).toBe('lf334xjjycrwlot3');
    expect(TABLE_PRESENCE_TOPIC).toBe('athar/v1/t/lf334xjjycrwlot3/presence');
    expect(client.publishAsync).toHaveBeenCalledExactlyOnceWith(
      TABLE_PRESENCE_TOPIC,
      'online',
      { qos: 1, retain: true },
    );
    expect(client.endAsync).toHaveBeenCalledExactlyOnceWith();
  });

  it('closes and rejects if the broker reports an error', async () => {
    const client = new FakeMqttClient();
    const published = publishTablePresence(client);
    const brokerError = new Error('broker unavailable');

    client.emit('error', brokerError);

    await expect(published).rejects.toBe(brokerError);
    expect(client.publishAsync).not.toHaveBeenCalled();
    expect(client.endAsync).toHaveBeenCalledExactlyOnceWith();
  });

  it('closes and rejects if publishing fails', async () => {
    const client = new FakeMqttClient();
    const publishError = new Error('publish failed');
    client.publishAsync.mockRejectedValue(publishError);
    const published = publishTablePresence(client);

    client.emit('connect');

    await expect(published).rejects.toBe(publishError);
    expect(client.endAsync).toHaveBeenCalledExactlyOnceWith();
  });
});
