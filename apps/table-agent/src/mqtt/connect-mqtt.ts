/**
 * Builds the real MQTT connection for the agent: the table's own broker
 * account (username = table id, per `hardware/README.md`), its Last Will
 * (`offline`, retained — the broker publishes it if the Pi disappears), and
 * TLS when the URL calls for it (`mqtts://`/`wss://`; plain `mqtt://` for the
 * on-site local broker, per `hardware/table-agent/agent.example.yaml`).
 */

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import mqtt, { type MqttClient } from 'mqtt';
import type { AgentConfig } from '../config/load-config.js';

export function connectMqtt(config: AgentConfig, password: string): MqttClient {
  const usesTls = config.mqtt.url.startsWith('mqtts://') || config.mqtt.url.startsWith('wss://');

  return mqtt.connect(config.mqtt.url, {
    clientId: `athar-agent-${config.tableId}-${randomUUID().slice(0, 8)}`,
    username: config.mqtt.username,
    password,
    keepalive: config.mqtt.keepaliveS,
    clean: config.mqtt.cleanSession,
    reconnectPeriod: 2000,
    connectTimeout: 10_000,
    ...(usesTls && config.mqtt.caFile !== undefined
      ? { ca: readFileSync(config.mqtt.caFile) }
      : {}),
    will: {
      topic: config.mqtt.will.topic,
      payload: config.mqtt.will.payload,
      qos: config.mqtt.will.qos,
      retain: config.mqtt.will.retain,
    },
  });
}
