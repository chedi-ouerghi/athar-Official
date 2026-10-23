import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  DEVICE_PROTOCOL_VERSION,
  deviceAckSchema,
  deviceStatusMessageSchema,
  deviceTopics,
  trajectorySchema,
  type DeviceAck,
  type DeviceStatusMessage,
} from '@athar/contracts';
import { TableAgent } from '../src/agent/table-agent.js';
import { FakeBoardPort } from '../src/board/fake-board-port.js';
import type { AgentConfig } from '../src/config/load-config.js';
import { FakeMqttClient } from '../src/mqtt/fake-mqtt-client.js';

const TABLE_ID = 'e2e-table';
const TOPICS = deviceTopics(TABLE_ID);

function baseConfig(): AgentConfig {
  return {
    tableId: TABLE_ID,
    mqtt: {
      url: 'mqtt://127.0.0.1:1883',
      username: TABLE_ID,
      passwordFile: '/etc/athar/mqtt.secret',
      caFile: undefined,
      keepaliveS: 30,
      cleanSession: false,
      will: { topic: TOPICS.presence, payload: 'offline', qos: 1, retain: true },
    },
    board: { port: '/dev/fake', baud: 115_200, plannerBufferLines: 4, statusPollMs: 50 },
    geometry: { shape: 'circle', radiusMm: 300, rhoMargin: 0.02, couplingMmPerDeg: 0 },
    motion: {
      ballSpeedMmS: 1000,
      maxThetaDegPerS: 100_000,
      segmentMaxDeg: 90,
      rewrapThetaWhenIdle: false,
      homeBeforeJob: true,
    },
  };
}

function startCommand(points: [number, number][]) {
  return {
    v: DEVICE_PROTOCOL_VERSION,
    cmdId: randomUUID(),
    sentAt: new Date().toISOString(),
    type: 'start' as const,
    jobId: randomUUID(),
    trajectory: trajectorySchema.parse({ format: 'polar-theta-rho/v1', points }),
  };
}

function emitCommand(mqtt: FakeMqttClient, command: unknown): void {
  mqtt.emit('message', TOPICS.cmd, Buffer.from(JSON.stringify(command)));
}

function statusMessages(mqtt: FakeMqttClient): DeviceStatusMessage[] {
  return mqtt.published
    .filter((message) => message.topic === TOPICS.status)
    .map((message) => deviceStatusMessageSchema.parse(JSON.parse(message.message)));
}

function lastStatus(mqtt: FakeMqttClient): DeviceStatusMessage | undefined {
  return statusMessages(mqtt).at(-1);
}

function acksFor(mqtt: FakeMqttClient, cmdId: string): DeviceAck[] {
  return mqtt.published
    .filter((message) => message.topic === TOPICS.ack)
    .map((message) => deviceAckSchema.parse(JSON.parse(message.message)))
    .filter((ack) => ack.cmdId === cmdId);
}

async function setUp(config: AgentConfig = baseConfig()) {
  const mqtt = new FakeMqttClient();
  const board = new FakeBoardPort();
  const agent = new TableAgent({ config, mqtt, board });
  await agent.start();
  mqtt.emit('connect');

  return { mqtt, board, agent };
}

describe('TableAgent (fake MQTT + fake board)', () => {
  it('announces presence and subscribes only to its own cmd topic on connect', async () => {
    const { mqtt, agent } = await setUp();

    expect(mqtt.subscriptions).toEqual([[TOPICS.cmd]]);
    expect(mqtt.published.find((message) => message.topic === TOPICS.presence)?.message).toBe(
      'online',
    );

    await agent.close();
  });

  it('runs a job from start to completed; every message round-trips the wire schema', async () => {
    const { mqtt, board, agent } = await setUp();

    const command = startCommand([
      [0, 0.1],
      [Math.PI, 0.6],
    ]);
    emitCommand(mqtt, command);

    expect(lastStatus(mqtt)?.phase).toBe('drawing');
    await vi.waitFor(() => expect(acksFor(mqtt, command.cmdId)).toHaveLength(1));
    expect(acksFor(mqtt, command.cmdId)[0]).toMatchObject({ ok: true, errorCode: null });

    await vi.waitFor(() => expect(lastStatus(mqtt)?.phase).toBe('completed'));
    expect(lastStatus(mqtt)?.progress).toBe(1);
    expect(board.position[0]).not.toBe(0);

    await agent.close();
  });

  it('answers a duplicated cmdId (QoS1 redelivery) without starting a second drawing', async () => {
    const { mqtt, agent } = await setUp();

    const command = startCommand([
      [0, 0.1],
      [Math.PI, 0.6],
    ]);
    emitCommand(mqtt, command);
    emitCommand(mqtt, command); // redelivered by the broker

    await vi.waitFor(() => expect(acksFor(mqtt, command.cmdId)).toHaveLength(2));
    const [first, second] = acksFor(mqtt, command.cmdId);
    expect(first).toEqual(second);

    await vi.waitFor(() => expect(lastStatus(mqtt)?.phase).toBe('completed'));

    await agent.close();
  });

  it('rejects a start while a job is already running, with errorCode BUSY', async () => {
    const { mqtt, board, agent } = await setUp();

    // Keeps the first job mid-flight long enough to overlap with the second request.
    board.queueFault({ kind: 'slow', delayMs: 300 });
    const first = startCommand([
      [0, 0.1],
      [Math.PI, 0.6],
    ]);
    emitCommand(mqtt, first);
    expect(lastStatus(mqtt)?.phase).toBe('drawing');

    const second = startCommand([
      [0, 0.1],
      [Math.PI, 0.6],
    ]);
    emitCommand(mqtt, second);

    await vi.waitFor(() => expect(acksFor(mqtt, second.cmdId)).toHaveLength(1));
    expect(acksFor(mqtt, second.cmdId)[0]).toMatchObject({ ok: false, errorCode: 'BUSY' });

    await vi.waitFor(() => expect(lastStatus(mqtt)?.phase).toBe('completed'), { timeout: 2000 });
    await agent.close();
  });

  it('rejects a trajectory with no length as TRAJECTORY_REJECTED', async () => {
    const { mqtt, agent } = await setUp();

    const command = startCommand([
      [0, 0.5],
      [0, 0.5],
    ]); // same point twice: zero length
    emitCommand(mqtt, command);

    await vi.waitFor(() => expect(acksFor(mqtt, command.cmdId)).toHaveLength(1));
    expect(acksFor(mqtt, command.cmdId)[0]).toMatchObject({
      ok: false,
      errorCode: 'TRAJECTORY_REJECTED',
    });
    expect(lastStatus(mqtt)?.phase).toBe('idle');

    await agent.close();
  });

  it('reports phase failed with errorCode FAULT when the board raises an ALARM', async () => {
    const { mqtt, board, agent } = await setUp();

    board.queueFault({ kind: 'alarm', code: '9' });
    const command = startCommand([
      [0, 0.1],
      [Math.PI, 0.6],
    ]);
    emitCommand(mqtt, command);

    await vi.waitFor(() => expect(lastStatus(mqtt)?.phase).toBe('failed'));
    expect(lastStatus(mqtt)?.errorCode).toBe('FAULT');

    await agent.close();
  });

  it('stops a running job on request and reports phase cancelled', async () => {
    const { mqtt, board, agent } = await setUp();

    board.queueFault({ kind: 'slow', delayMs: 300 });
    const command = startCommand([
      [0, 0.1],
      [Math.PI, 0.6],
    ]);
    emitCommand(mqtt, command);
    expect(lastStatus(mqtt)?.phase).toBe('drawing');

    emitCommand(mqtt, {
      v: DEVICE_PROTOCOL_VERSION,
      cmdId: randomUUID(),
      sentAt: new Date().toISOString(),
      type: 'stop' as const,
      jobId: command.jobId,
    });

    expect(lastStatus(mqtt)?.phase).toBe('cancelled');

    await agent.close();
  });

  it('reports connection "error" in status once the board disconnects', async () => {
    const { mqtt, board, agent } = await setUp();

    board.queueFault({ kind: 'disconnect' });
    await board.sendLine('?').catch(() => undefined);

    await vi.waitFor(() => expect(lastStatus(mqtt)?.connection).toBe('error'));

    await agent.close();
  });
});
