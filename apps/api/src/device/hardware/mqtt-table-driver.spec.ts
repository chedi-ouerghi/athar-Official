import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEVICE_ACK_TIMEOUT_MS,
  deviceCommandSchema,
  deviceTopics,
  type DeviceCommand,
} from '@athar/contracts';
import { DriverError, type DriverEvent, type DriverStartRequest } from '../table-driver.js';
import { FakeMqttClient } from './fake-mqtt-client.js';
import { MqttTableDriver } from './mqtt-table-driver.js';

const TABLE = 'table-abc';
const topics = deviceTopics(TABLE);

const flush = () => vi.advanceTimersByTimeAsync(0);

/** The outcome of a promise, so a rejection can be asserted after it happened. */
const outcome = (promise: Promise<unknown>) =>
  promise.then(
    () => 'resolved' as const,
    (error: unknown) => error,
  );

function hear(client: FakeMqttClient, topic: string, payload: string | object): void {
  client.emit(
    'message',
    topic,
    Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)),
  );
}

function statusMessage(overrides: Record<string, unknown> = {}) {
  return {
    v: 1,
    tableId: TABLE,
    mode: 'hardware',
    connection: 'online',
    phase: 'idle',
    jobId: null,
    progress: 0,
    errorCode: null,
    ambienceId: null,
    observedAt: '2026-10-21T13:00:00.000Z',
    ...overrides,
  };
}

function lastCommand(client: FakeMqttClient): DeviceCommand {
  const message = client.published.at(-1)?.message;

  return deviceCommandSchema.parse(JSON.parse(message ?? 'null'));
}

function acknowledge(
  client: FakeMqttClient,
  cmdId: string,
  result: { ok: boolean; errorCode: string | null } = { ok: true, errorCode: null },
  tableId = TABLE,
): void {
  hear(client, deviceTopics(tableId).ack, { v: 1, cmdId, ...result });
}

const startRequest: DriverStartRequest = {
  jobId: randomUUID(),
  estimatedDurationSeconds: 600,
  geometry: { shape: 'oval', widthMm: 1000, heightMm: 600 },
  trajectory: {
    format: 'polar-theta-rho/v1',
    points: [
      [0, 0],
      [6, 1],
    ],
  },
};

describe('MqttTableDriver', () => {
  let client: FakeMqttClient;
  let driver: MqttTableDriver;

  beforeEach(() => {
    vi.useFakeTimers();
    client = new FakeMqttClient();
    driver = new MqttTableDriver({ client });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const bringOnline = () => hear(client, topics.presence, 'online');

  it('is a hardware driver', () => {
    expect(driver.mode).toBe('hardware');
  });

  it('subscribes to the ack, status and presence of every table on each connection', async () => {
    client.emit('connect');
    client.emit('connect');
    await flush();

    expect(client.subscriptions).toStrictEqual([
      ['athar/v1/t/+/ack', 'athar/v1/t/+/status', 'athar/v1/t/+/presence'],
      ['athar/v1/t/+/ack', 'athar/v1/t/+/status', 'athar/v1/t/+/presence'],
    ]);
  });

  describe('commands', () => {
    it('start publishes a valid, non-retained QoS 1 command and resolves only on its ack', async () => {
      bringOnline();
      const result = outcome(driver.startJob(TABLE, startRequest));
      await flush();

      expect(client.published).toHaveLength(1);
      expect(client.published[0]).toMatchObject({
        topic: topics.cmd,
        options: { qos: 1, retain: false },
      });

      const command = lastCommand(client);

      expect(command).toMatchObject({
        type: 'start',
        jobId: startRequest.jobId,
        // The table's size travels with the trajectory, for the Pi to scale it.
        geometry: { shape: 'oval', widthMm: 1000, heightMm: 600 },
        estimatedDurationSeconds: 600,
      });

      let settled = false;
      void result.then(() => {
        settled = true;
      });
      await flush();
      expect(settled).toBe(false);

      acknowledge(client, command.cmdId);

      expect(await result).toBe('resolved');
    });

    it.each(['pause', 'resume', 'stop'] as const)(
      '%s names the job and resolves on its ack',
      async (type) => {
        bringOnline();
        const jobId = randomUUID();
        const result = outcome(driver[type](TABLE, jobId));
        await flush();

        const command = lastCommand(client);

        expect(command).toMatchObject({ type, jobId });

        acknowledge(client, command.cmdId);

        expect(await result).toBe('resolved');
      },
    );

    it("a refusal rejects with the table's own error code", async () => {
      bringOnline();
      const result = outcome(driver.startJob(TABLE, startRequest));
      await flush();

      acknowledge(client, lastCommand(client).cmdId, { ok: false, errorCode: 'BUSY' });

      expect(await result).toMatchObject({ name: 'DriverError', code: 'BUSY' });
    });

    it(`fails with OFFLINE when no ack arrives within ${DEVICE_ACK_TIMEOUT_MS} ms`, async () => {
      bringOnline();
      const result = outcome(driver.pause(TABLE, randomUUID()));
      await flush();
      const { cmdId } = lastCommand(client);

      await vi.advanceTimersByTimeAsync(DEVICE_ACK_TIMEOUT_MS - 1);
      expect(vi.getTimerCount()).toBe(1);

      await vi.advanceTimersByTimeAsync(1);

      expect(await result).toMatchObject({ code: 'OFFLINE' });
      expect(vi.getTimerCount()).toBe(0);

      // A late ack changes nothing and does not throw.
      expect(() => {
        acknowledge(client, cmdId);
      }).not.toThrow();
    });

    it('ignores an ack that comes from another table', async () => {
      bringOnline();
      const result = outcome(driver.stop(TABLE, randomUUID()));
      await flush();
      const { cmdId } = lastCommand(client);

      acknowledge(client, cmdId, { ok: true, errorCode: null }, 'table-xyz');
      await vi.advanceTimersByTimeAsync(DEVICE_ACK_TIMEOUT_MS);

      expect(await result).toMatchObject({ code: 'OFFLINE' });
    });

    it('ignores an unreadable ack, or one for a command it never sent', async () => {
      bringOnline();
      const result = outcome(driver.stop(TABLE, randomUUID()));
      await flush();

      hear(client, topics.ack, 'not json');
      hear(client, topics.ack, { v: 1, cmdId: randomUUID(), ok: true, errorCode: null });
      hear(client, topics.ack, {
        v: 1,
        cmdId: lastCommand(client).cmdId,
        ok: true,
        errorCode: 'BUSY',
      });
      await vi.advanceTimersByTimeAsync(DEVICE_ACK_TIMEOUT_MS);

      expect(await result).toMatchObject({ code: 'OFFLINE' });
    });

    it('is refused without publishing while the table has not been heard', async () => {
      await expect(driver.startJob(TABLE, startRequest)).rejects.toMatchObject({ code: 'OFFLINE' });

      bringOnline();
      hear(client, topics.presence, 'offline');

      await expect(driver.pause(TABLE, randomUUID())).rejects.toBeInstanceOf(DriverError);
      expect(client.published).toHaveLength(0);
    });

    it('is refused without publishing while the broker connection is down', async () => {
      bringOnline();
      client.connected = false;

      await expect(driver.resume(TABLE, randomUUID())).rejects.toMatchObject({ code: 'OFFLINE' });
      expect(client.published).toHaveLength(0);
    });

    it('rejects a trajectory the protocol does not allow, without publishing', async () => {
      bringOnline();

      await expect(
        driver.startJob(TABLE, {
          ...startRequest,
          trajectory: {
            format: 'polar-theta-rho/v1',
            points: [
              [0, 0],
              [1, 2],
            ],
          },
        }),
      ).rejects.toMatchObject({ code: 'TRAJECTORY_REJECTED' });
      expect(client.published).toHaveLength(0);
    });

    it('fails with OFFLINE, leaving no timer behind, when the publish itself fails', async () => {
      bringOnline();
      client.publishError = new Error('socket closed');

      await expect(driver.stop(TABLE, randomUUID())).rejects.toMatchObject({ code: 'OFFLINE' });
      expect(vi.getTimerCount()).toBe(0);
    });

    it('setAmbience sends the preset as a light command, and reads it back once acknowledged', async () => {
      bringOnline();
      hear(client, topics.status, statusMessage());

      const result = outcome(driver.setAmbience(TABLE, 'warm-dusk'));
      await flush();
      const command = lastCommand(client);

      expect(command).toMatchObject({
        type: 'light',
        light: { mode: 'preset', ambienceId: 'warm-dusk' },
      });

      acknowledge(client, command.cmdId);
      await result;

      expect(await driver.getStatus(TABLE)).toMatchObject({ ambienceId: 'warm-dusk' });
    });
  });

  describe('light', () => {
    it('setLight sends any light, and reads back that it is no named ambience', async () => {
      bringOnline();
      hear(client, topics.status, statusMessage({ ambienceId: 'amber' }));

      const result = outcome(
        driver.setLight(TABLE, { mode: 'color', color: '#ff0000', brightness: 50 }),
      );
      await flush();
      const command = lastCommand(client);

      expect(command).toMatchObject({
        type: 'light',
        light: { mode: 'color', color: '#ff0000', brightness: 50 },
      });

      acknowledge(client, command.cmdId);
      await result;

      expect(await driver.getStatus(TABLE)).toMatchObject({ ambienceId: null });
    });

    it('is refused without publishing while the table is offline', async () => {
      await expect(driver.setLight(TABLE, { mode: 'off' })).rejects.toMatchObject({
        code: 'OFFLINE',
      });
      expect(client.published).toHaveLength(0);
    });
  });

  describe('presence and status', () => {
    it('reads as offline until the table has been heard', async () => {
      expect(await driver.getStatus(TABLE)).toMatchObject({
        mode: 'hardware',
        connection: 'offline',
        phase: 'idle',
        jobId: null,
        progress: 0,
      });
    });

    it('turns the table online and notifies subscribers', async () => {
      const events: DriverEvent[] = [];
      driver.subscribe(TABLE, (event) => events.push(event));

      bringOnline();

      expect(events.map((event) => event.connection)).toStrictEqual(['online']);
      expect(await driver.getStatus(TABLE)).toMatchObject({ connection: 'online' });
    });

    it('passes a status to subscribers: busy while drawing, with its progress', async () => {
      const events: DriverEvent[] = [];
      driver.subscribe(TABLE, (event) => events.push(event));
      const jobId = randomUUID();

      bringOnline();
      hear(client, topics.status, statusMessage({ phase: 'drawing', jobId, progress: 0.4 }));

      expect(events.at(-1)).toMatchObject({
        tableId: TABLE,
        mode: 'hardware',
        connection: 'busy',
        phase: 'drawing',
        jobId,
        progress: 0.4,
      });
      expect(await driver.getStatus(TABLE)).toStrictEqual(events.at(-1));
    });

    it("reports the table's own error", async () => {
      bringOnline();
      hear(client, topics.status, statusMessage({ connection: 'error', errorCode: 'FAULT' }));

      expect(await driver.getStatus(TABLE)).toMatchObject({
        mode: 'hardware',
        connection: 'error',
        errorCode: 'FAULT',
      });
    });

    it('when the table goes offline mid-drawing, keeps the phase and progress and fails pending commands', async () => {
      const events: DriverEvent[] = [];
      driver.subscribe(TABLE, (event) => events.push(event));
      bringOnline();
      hear(
        client,
        topics.status,
        statusMessage({ phase: 'drawing', jobId: randomUUID(), progress: 0.3 }),
      );

      const pending = outcome(driver.pause(TABLE, randomUUID()));
      await flush();

      hear(client, topics.presence, 'offline');

      expect(await pending).toMatchObject({ code: 'OFFLINE' });
      expect(events.at(-1)).toMatchObject({
        connection: 'offline',
        phase: 'drawing',
        progress: 0.3,
      });
    });

    it('treats the loss of the broker as every table going offline, and recovers with the retained messages', async () => {
      bringOnline();
      hear(
        client,
        topics.status,
        statusMessage({ phase: 'drawing', jobId: randomUUID(), progress: 0.5 }),
      );
      const pending = outcome(driver.pause(TABLE, randomUUID()));
      await flush();

      client.connected = false;
      client.emit('close');

      expect(await pending).toMatchObject({ code: 'OFFLINE' });
      expect(await driver.getStatus(TABLE)).toMatchObject({ connection: 'offline', progress: 0.5 });

      client.connected = true;
      client.emit('connect');
      bringOnline();

      expect(await driver.getStatus(TABLE)).toMatchObject({ connection: 'busy', progress: 0.5 });
    });

    it('ignores a status naming another table, an unreadable one, and one that breaks the protocol', async () => {
      const listener = vi.fn();
      driver.subscribe(TABLE, listener);
      bringOnline();
      listener.mockClear();

      hear(client, topics.status, statusMessage({ tableId: 'table-xyz' }));
      hear(client, topics.status, '{broken');
      hear(client, topics.status, statusMessage({ progress: 7 }));
      hear(client, topics.presence, 'maybe');
      client.emit(
        'message',
        'athar/v1/t/Bad_Id/status',
        Buffer.from(JSON.stringify(statusMessage())),
      );
      client.emit('message', 'athar/v1/t/table-abc/other', Buffer.from('x'));
      hear(client, topics.status, ' '.repeat(65 * 1024));

      expect(listener).not.toHaveBeenCalled();
      expect(await driver.getStatus(TABLE)).toMatchObject({ phase: 'idle', progress: 0 });
    });

    it('stops notifying after unsubscribe, and a throwing listener does not stop the others', () => {
      const other = vi.fn();
      const unsubscribe = driver.subscribe(TABLE, other);
      driver.subscribe(TABLE, () => {
        throw new Error('listener bug');
      });
      const last = vi.fn();
      driver.subscribe(TABLE, last);

      bringOnline();

      expect(other).toHaveBeenCalledTimes(1);
      expect(last).toHaveBeenCalledTimes(1);

      unsubscribe();
      hear(client, topics.presence, 'offline');

      expect(other).toHaveBeenCalledTimes(1);
      expect(last).toHaveBeenCalledTimes(2);
    });

    it('keeps tables apart', async () => {
      bringOnline();
      hear(
        client,
        deviceTopics('table-xyz').status,
        statusMessage({ tableId: 'table-xyz', phase: 'drawing', jobId: randomUUID() }),
      );

      expect(await driver.getStatus(TABLE)).toMatchObject({ phase: 'idle' });
      expect(await driver.getStatus('table-xyz')).toMatchObject({
        phase: 'drawing',
        connection: 'offline',
      });
    });
  });

  it('on shutdown, fails what is pending and ends the connection', async () => {
    bringOnline();
    const pending = outcome(driver.stop(TABLE, randomUUID()));
    await flush();

    await driver.onModuleDestroy();

    expect(await pending).toMatchObject({ code: 'OFFLINE' });
    expect(client.ended).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
