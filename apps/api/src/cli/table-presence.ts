import { randomUUID } from 'node:crypto';
import { connect } from 'mqtt';
import type { MqttClient } from 'mqtt';
import { loadAppConfig } from '../config/load-app-config.js';
import { isEntryPoint, processIo } from './cli-io.js';

export const TABLE_PRESENCE_ID = 'lf334xjjycrwlot3';
export const TABLE_PRESENCE_TOPIC = `athar/v1/t/${TABLE_PRESENCE_ID}/presence`;

export interface PresenceMqttClient {
  readonly connected: boolean;
  on(event: 'connect', listener: () => void): unknown;
  on(event: 'error', listener: (error: Error) => void): unknown;
  removeListener(event: 'connect', listener: () => void): unknown;
  removeListener(event: 'error', listener: (error: Error) => void): unknown;
  publishAsync(
    topic: string,
    message: string,
    options: { qos: 1; retain: true },
  ): Promise<unknown>;
  endAsync(force?: boolean): Promise<unknown>;
}

/** Publish one retained online presence and close the client after its PUBACK. */
export function publishTablePresence(
  client: PresenceMqttClient,
  topic: string = TABLE_PRESENCE_TOPIC,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let finished = false;
    let publishing = false;

    const finish = async (error?: Error): Promise<void> => {
      if (finished) {
        return;
      }

      finished = true;
      client.removeListener('connect', onConnect);
      client.removeListener('error', onError);

      try {
        await client.endAsync();
      } catch (closeError) {
        const normalizedCloseError =
          closeError instanceof Error ? closeError : new Error(String(closeError));

        reject(
          error === undefined
            ? normalizedCloseError
            : new AggregateError(
                [error, normalizedCloseError],
                'Publishing failed and the MQTT client could not close.',
              ),
        );
        return;
      }

      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    };

    const onError = (error: Error): void => {
      void finish(error);
    };

    const onConnect = (): void => {
      if (finished || publishing) {
        return;
      }

      publishing = true;
      void client
        .publishAsync(topic, 'online', { qos: 1, retain: true })
        .then(() => finish())
        .catch((error: unknown) =>
          finish(error instanceof Error ? error : new Error(String(error))),
        );
    };

    client.on('error', onError);
    client.on('connect', onConnect);

    if (client.connected) {
      onConnect();
    }
  });
}

async function main(): Promise<void> {
  const config = await loadAppConfig();
  const tableId = process.env.TABLE_ID || TABLE_PRESENCE_ID;
  const topic = `athar/v1/t/${tableId}/presence`;
  const password = process.env.TABLE_MQTT_PASSWORD;

  if (password === undefined || password.length === 0) {
    throw new Error('TABLE_MQTT_PASSWORD must be set to the table broker password.');
  }

  const client: MqttClient = connect(config.mqtt.url, {
    clientId: `athar-table-${tableId}-${randomUUID()}`,
    clean: true,
    reconnectPeriod: 0,
    connectTimeout: 10_000,
    username: tableId,
    password,
  });

  await publishTablePresence(client, topic);
  processIo.out(`Published online presence to ${topic}`);
}

if (isEntryPoint(import.meta.url)) {
  void main().catch((error: unknown) => {
    processIo.err(
      `table:presence failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
}
