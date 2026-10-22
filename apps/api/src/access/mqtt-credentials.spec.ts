import { describe, expect, it } from 'vitest';
import { mqttCredentialsSchema } from '@athar/contracts';
import { newMqttCredentials } from './mqtt-credentials.js';

describe('newMqttCredentials', () => {
  it('names the broker from MQTT_URL and the table by its id', () => {
    const credentials = newMqttCredentials('table-abc', 'mqtts://broker.example.com:8884');

    expect(credentials).toMatchObject({
      host: 'broker.example.com',
      port: 8884,
      tls: true,
      username: 'table-abc',
      clientId: 'table-abc',
    });
    expect(mqttCredentialsSchema.safeParse(credentials).success).toBe(true);
  });

  it.each([
    ['mqtt://localhost', 1883, false],
    ['mqtt://localhost:1883', 1883, false],
    ['mqtts://broker.example.com', 8883, true],
    ['ws://broker.example.com', 80, false],
    ['wss://broker.example.com', 443, true],
  ])('reads %s as port %i, TLS %s', (url, port, tls) => {
    expect(newMqttCredentials('table-abc', url)).toMatchObject({ port, tls });
  });

  it('gives every call a different, long random password', () => {
    const first = newMqttCredentials('table-abc', 'mqtt://localhost').password;
    const second = newMqttCredentials('table-abc', 'mqtt://localhost').password;

    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(32);
  });
});
