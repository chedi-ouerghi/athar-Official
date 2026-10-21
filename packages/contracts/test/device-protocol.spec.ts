import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  DEVICE_PROTOCOL_VERSION,
  TRAJECTORY_MAX_POINTS,
  deviceAckSchema,
  deviceCommandSchema,
  devicePresenceSchema,
  deviceStatusMessageSchema,
  deviceTopics,
  trajectorySchema,
} from '../src/index.js';

const envelope = () => ({
  v: DEVICE_PROTOCOL_VERSION,
  cmdId: randomUUID(),
  sentAt: new Date().toISOString(),
});

const trajectory = {
  format: 'polar-theta-rho/v1' as const,
  points: [
    [0, 0],
    [6.28, 1],
  ] as [number, number][],
};

describe('deviceTopics', () => {
  it('names the four topics of a table', () => {
    expect(deviceTopics('table-abc')).toStrictEqual({
      cmd: 'athar/v1/t/table-abc/cmd',
      ack: 'athar/v1/t/table-abc/ack',
      status: 'athar/v1/t/table-abc/status',
      presence: 'athar/v1/t/table-abc/presence',
    });
  });

  it.each(['a/b/c', 'abc/#', 'abc/+', '+', '#', 'AB', ''])(
    'refuses %j, so a topic can never address another table',
    (id) => {
      expect(() => deviceTopics(id)).toThrow();
    },
  );
});

describe('trajectorySchema', () => {
  it('accepts a valid trajectory', () => {
    expect(trajectorySchema.safeParse(trajectory).success).toBe(true);
  });

  it('rejects one point, rho outside 0..1, non-finite values and a wrong format', () => {
    expect(trajectorySchema.safeParse({ ...trajectory, points: [[0, 0]] }).success).toBe(false);
    expect(
      trajectorySchema.safeParse({
        ...trajectory,
        points: [
          [0, 0],
          [1, 1.5],
        ],
      }).success,
    ).toBe(false);
    expect(
      trajectorySchema.safeParse({
        ...trajectory,
        points: [
          [0, 0],
          [Infinity, 1],
        ],
      }).success,
    ).toBe(false);
    expect(trajectorySchema.safeParse({ ...trajectory, format: 'gcode' }).success).toBe(false);
  });

  it('caps the number of points', () => {
    const points = Array.from({ length: TRAJECTORY_MAX_POINTS + 1 }, () => [0, 0.5]);

    expect(trajectorySchema.safeParse({ ...trajectory, points }).success).toBe(false);
  });
});

describe('deviceCommandSchema', () => {
  it('accepts every command type', () => {
    const jobId = randomUUID();
    const commands = [
      { ...envelope(), type: 'start', jobId, trajectory, estimatedDurationSeconds: 600 },
      { ...envelope(), type: 'pause', jobId },
      { ...envelope(), type: 'resume', jobId },
      { ...envelope(), type: 'stop', jobId },
      { ...envelope(), type: 'light', light: { mode: 'color', color: '#FF0000' } },
    ];

    for (const command of commands) {
      expect(deviceCommandSchema.safeParse(command).success, command.type).toBe(true);
    }
  });

  it('normalises the light inside a light command', () => {
    const parsed = deviceCommandSchema.parse({
      ...envelope(),
      type: 'light',
      light: { mode: 'color', color: '#FF0000' },
    });

    expect(parsed.type === 'light' && parsed.light).toStrictEqual({
      mode: 'color',
      color: '#ff0000',
      brightness: 100,
    });
  });

  it('rejects a command without cmdId, with another version or an unknown type', () => {
    const { cmdId: _cmdId, ...withoutCmdId } = envelope();

    expect(
      deviceCommandSchema.safeParse({ ...withoutCmdId, type: 'pause', jobId: randomUUID() })
        .success,
    ).toBe(false);
    expect(
      deviceCommandSchema.safeParse({ ...envelope(), v: 2, type: 'pause', jobId: randomUUID() })
        .success,
    ).toBe(false);
    expect(deviceCommandSchema.safeParse({ ...envelope(), type: 'reboot' }).success).toBe(false);
  });

  it('start needs a job and a trajectory; pause needs a job', () => {
    expect(
      deviceCommandSchema.safeParse({ ...envelope(), type: 'start', jobId: randomUUID() }).success,
    ).toBe(false);
    expect(deviceCommandSchema.safeParse({ ...envelope(), type: 'pause' }).success).toBe(false);
  });
});

describe('deviceAckSchema', () => {
  const base = { v: DEVICE_PROTOCOL_VERSION, cmdId: randomUUID() };

  it('ok has no error code, a refusal has one', () => {
    expect(deviceAckSchema.safeParse({ ...base, ok: true, errorCode: null }).success).toBe(true);
    expect(deviceAckSchema.safeParse({ ...base, ok: false, errorCode: 'BUSY' }).success).toBe(true);
  });

  it('rejects ok with a code, and a refusal without one', () => {
    expect(deviceAckSchema.safeParse({ ...base, ok: true, errorCode: 'BUSY' }).success).toBe(false);
    expect(deviceAckSchema.safeParse({ ...base, ok: false, errorCode: null }).success).toBe(false);
  });

  it('rejects an error code the driver does not know', () => {
    expect(deviceAckSchema.safeParse({ ...base, ok: false, errorCode: 'EXPLODED' }).success).toBe(
      false,
    );
  });
});

describe('deviceStatusMessageSchema', () => {
  const status = {
    v: DEVICE_PROTOCOL_VERSION,
    tableId: 'table-abc',
    mode: 'hardware',
    connection: 'online',
    phase: 'drawing',
    jobId: randomUUID(),
    progress: 0.42,
    errorCode: null,
    ambienceId: null,
    observedAt: new Date().toISOString(),
  };

  it('accepts a status; a table that reports no light gets null', () => {
    const parsed = deviceStatusMessageSchema.parse(status);

    expect(parsed.progress).toBe(0.42);
    expect(parsed.light).toBeNull();
  });

  it('carries the light the table shows', () => {
    const parsed = deviceStatusMessageSchema.parse({ ...status, light: { mode: 'on' } });

    expect(parsed.light).toStrictEqual({ mode: 'on' });
  });

  it('rejects a progress outside 0..1', () => {
    expect(deviceStatusMessageSchema.safeParse({ ...status, progress: 1.2 }).success).toBe(false);
  });
});

describe('devicePresenceSchema', () => {
  it('is online or offline', () => {
    expect(devicePresenceSchema.options).toStrictEqual(['online', 'offline']);
  });
});
