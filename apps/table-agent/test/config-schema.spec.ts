import { describe, expect, it } from 'vitest';
import { AgentConfigError, parseAgentConfig } from '../src/config/agent-config.schema.js';

function validDocument(): Record<string, unknown> {
  return {
    table: { id: 'my-table' },
    mqtt: {
      url: 'mqtt://127.0.0.1:1883',
      username: 'my-table',
      password_file: '/etc/athar/mqtt.secret',
      keepalive_s: 30,
      clean_session: false,
      will: {
        topic: 'athar/v1/t/my-table/presence',
        payload: 'offline',
        qos: 1,
        retain: true,
      },
    },
    board: { port: '/dev/serial/by-id/x', baud: 115_200, planner_buffer_lines: 12, status_poll_ms: 250 },
    geometry: { shape: 'circle', radius_mm: 300, rho_margin: 0.02, coupling_mm_per_deg: 0 },
    motion: {
      ball_speed_mm_s: 30,
      max_theta_deg_per_s: 60,
      segment_max_deg: 2,
      rewrap_theta_when_idle: true,
      home_before_job: true,
    },
  };
}

describe('parseAgentConfig', () => {
  it('accepts a valid document and maps snake_case keys to camelCase', () => {
    const config = parseAgentConfig(validDocument());

    expect(config.tableId).toBe('my-table');
    expect(config.mqtt.passwordFile).toBe('/etc/athar/mqtt.secret');
    expect(config.mqtt.will.topic).toBe('athar/v1/t/my-table/presence');
    expect(config.board.plannerBufferLines).toBe(12);
    expect(config.geometry.radiusMm).toBe(300);
    expect(config.motion.ballSpeedMmS).toBe(30);
  });

  it('rejects an invalid table id', () => {
    const doc = validDocument();
    (doc.table as Record<string, unknown>).id = 'Not Valid!';

    expect(() => parseAgentConfig(doc)).toThrow(AgentConfigError);
  });

  it('rejects a Last Will payload other than "offline"', () => {
    const doc = validDocument();
    (doc.mqtt as Record<string, unknown>).will = {
      ...(doc.mqtt as { will: object }).will,
      payload: 'online',
    };

    expect(() => parseAgentConfig(doc)).toThrow(AgentConfigError);
  });

  it('rejects a segment size outside the allowed range', () => {
    const doc = validDocument();
    (doc.motion as Record<string, unknown>).segment_max_deg = 90;

    expect(() => parseAgentConfig(doc)).toThrow(AgentConfigError);
  });

  it('applies defaults for optional fields', () => {
    const doc = validDocument();
    delete (doc.mqtt as Record<string, unknown>).keepalive_s;
    delete (doc.board as Record<string, unknown>).planner_buffer_lines;
    delete (doc.geometry as Record<string, unknown>).rho_margin;
    delete (doc.motion as Record<string, unknown>).home_before_job;

    const config = parseAgentConfig(doc);

    expect(config.mqtt.keepaliveS).toBe(30);
    expect(config.board.plannerBufferLines).toBe(12);
    expect(config.geometry.rhoMargin).toBe(0.02);
    expect(config.motion.homeBeforeJob).toBe(true);
  });
});
