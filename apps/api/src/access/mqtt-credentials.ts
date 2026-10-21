import type { MqttCredentials } from '@athar/contracts';
import { newToken } from '../auth/token.js';

const DEFAULT_PORTS: Readonly<Record<string, number>> = {
  'mqtt:': 1883,
  'mqtts:': 8883,
  'ws:': 80,
  'wss:': 443,
};

/**
 * The broker login to put on a table's controller: where the broker is (from
 * `MQTT_URL`) and a name and random password for this table alone.
 *
 * shortcut: nothing registers these on the broker yet, and the password is not
 * kept anywhere, so the operator creates the broker user by hand from this
 * answer. Replace with the broker's Dynamic Security plugin, storing a hash.
 *
 * @param brokerUrl - A validated `MQTT_URL`.
 */
export function newMqttCredentials(tableId: string, brokerUrl: string): MqttCredentials {
  const url = new URL(brokerUrl);
  const name = `t-${tableId}`;

  return {
    host: url.hostname,
    port: url.port === '' ? (DEFAULT_PORTS[url.protocol] ?? 1883) : Number(url.port),
    tls: url.protocol === 'mqtts:' || url.protocol === 'wss:',
    clientId: name,
    username: name,
    password: newToken(),
  };
}
