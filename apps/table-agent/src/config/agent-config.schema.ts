/**
 * Shape of `/etc/athar/agent.yaml`, mirroring
 * `hardware/table-agent/agent.example.yaml` field for field (same `snake_case`
 * keys, since that file is what a human edits on the table). The physical
 * calibration of the table (geometry, coupling, motion limits) lives in this
 * file, on the table itself — never in the API.
 *
 * Validation works on the raw `snake_case` document and transforms it into a
 * `camelCase` {@link AgentConfig} for the rest of the agent to consume.
 */

import { z } from 'zod';
import { tableIdSchema } from '@athar/contracts';

// Field names already match camelCase usage (topic/payload/qos/retain), so no transform is needed.
const willSchema = z.object({
  topic: z.string().min(1),
  payload: z.literal('offline'),
  qos: z.literal(1),
  retain: z.literal(true),
});

const mqttConfigSchema = z
  .object({
    url: z.string().min(1),
    username: tableIdSchema,
    /** Path to a file holding the broker password. Never the password itself. */
    password_file: z.string().min(1),
    /** Only meaningful for `mqtts://`/`wss://`; absent for plain `mqtt://`. */
    ca_file: z.string().min(1).optional(),
    keepalive_s: z.number().positive().default(30),
    clean_session: z.boolean().default(false),
    will: willSchema,
  })
  .transform((mqtt) => ({
    url: mqtt.url,
    username: mqtt.username,
    passwordFile: mqtt.password_file,
    caFile: mqtt.ca_file,
    keepaliveS: mqtt.keepalive_s,
    cleanSession: mqtt.clean_session,
    will: mqtt.will,
  }));

const boardConfigSchema = z
  .object({
    port: z.string().min(1),
    baud: z.number().int().positive().default(115_200),
    /** Streaming G-code: max lines "in flight" without an `ok`. */
    planner_buffer_lines: z.number().int().min(1).max(256).default(12),
    /** How often the agent polls `?` for a realtime status report. */
    status_poll_ms: z.number().int().min(50).max(5_000).default(250),
  })
  .transform((board) => ({
    port: board.port,
    baud: board.baud,
    plannerBufferLines: board.planner_buffer_lines,
    statusPollMs: board.status_poll_ms,
  }));

const geometryConfigSchema = z
  .object({
    /**
     * Informational only: the physical mechanism this agent drives is always a
     * round polar table (arm + carriage), unlike the API's abstract
     * `TableGeometry` (round/square/rectangle/oval) used to scale a preview.
     */
    shape: z.string().default('circle'),
    radius_mm: z.number().positive(),
    /** Never send rho above `1 - rho_margin`: keeps the ball off the physical edge. */
    rho_margin: z.number().min(0).max(0.5).default(0.02),
    /**
     * `Y_cmd = rho_mm + coupling_mm_per_deg * theta_deg`: correction for a rho
     * motor fixed to the frame while the arm it rides on rotates.
     */
    coupling_mm_per_deg: z.number().default(0),
  })
  .transform((geometry) => ({
    shape: geometry.shape,
    radiusMm: geometry.radius_mm,
    rhoMargin: geometry.rho_margin,
    couplingMmPerDeg: geometry.coupling_mm_per_deg,
  }));

const motionConfigSchema = z
  .object({
    ball_speed_mm_s: z.number().positive(),
    max_theta_deg_per_s: z.number().positive(),
    /** Long arcs are cut into steps no larger than this, in degrees of theta. */
    segment_max_deg: z.number().min(0.05).max(45).default(2),
    rewrap_theta_when_idle: z.boolean().default(true),
    /** Home ($H) before every `start`, not only once at agent startup. */
    home_before_job: z.boolean().default(true),
  })
  .transform((motion) => ({
    ballSpeedMmS: motion.ball_speed_mm_s,
    maxThetaDegPerS: motion.max_theta_deg_per_s,
    segmentMaxDeg: motion.segment_max_deg,
    rewrapThetaWhenIdle: motion.rewrap_theta_when_idle,
    homeBeforeJob: motion.home_before_job,
  }));

export const agentConfigSchema = z
  .object({
    table: z.object({ id: tableIdSchema }),
    mqtt: mqttConfigSchema,
    board: boardConfigSchema,
    geometry: geometryConfigSchema,
    motion: motionConfigSchema,
  })
  .transform((document) => ({
    tableId: document.table.id,
    mqtt: document.mqtt,
    board: document.board,
    geometry: document.geometry,
    motion: document.motion,
  }));
export type AgentConfig = z.infer<typeof agentConfigSchema>;

export class AgentConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentConfigError';
  }
}

/** Validates a parsed YAML document; throws {@link AgentConfigError} with every problem listed. */
export function parseAgentConfig(input: unknown): AgentConfig {
  const parsed = agentConfigSchema.safeParse(input);

  if (!parsed.success) {
    const reasons = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');

    throw new AgentConfigError(`Invalid agent configuration: ${reasons}.`);
  }

  return parsed.data;
}
