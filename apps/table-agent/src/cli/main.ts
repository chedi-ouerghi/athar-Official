/**
 * `node dist/cli/main.js` — the long-running process a systemd service
 * starts on the table's Raspberry Pi (`hardware/table-agent/athar-agent.service`).
 *
 * Wires the real board (USB serial) and the real broker connection to a
 * `TableAgent`, then blocks until the process is told to stop.
 */

import { TableAgent } from '../agent/table-agent.js';
import { SerialBoardPort } from '../board/serial-board-port.js';
import { AgentConfigError, DEFAULT_CONFIG_PATH, loadAgentConfig } from '../config/load-config.js';
import { connectMqtt } from '../mqtt/connect-mqtt.js';
import { processIo } from './cli-io.js';

async function main(): Promise<void> {
  const configPath = process.argv[2] ?? DEFAULT_CONFIG_PATH;
  const { config, mqttPassword } = await loadAgentConfig(configPath);

  const board = new SerialBoardPort({ path: config.board.port, baudRate: config.board.baud });
  const mqtt = connectMqtt(config, mqttPassword);
  const agent = new TableAgent({ config, mqtt, board });

  mqtt.on('error', (error) => {
    processIo.err(`MQTT client error: ${error.message}`);
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    processIo.out(`Received ${signal}, shutting down.`);
    await agent.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  await agent.start();
  processIo.out(`athar-agent started for table ${config.tableId} on ${config.board.port}.`);
}

main().catch((error: unknown) => {
  processIo.err(
    error instanceof AgentConfigError
      ? error.message
      : `athar-agent failed to start: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
