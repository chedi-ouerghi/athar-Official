import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import { agentConfigSchema, AgentConfigError, parseAgentConfig, type AgentConfig } from './agent-config.schema.js';

export { agentConfigSchema, AgentConfigError };
export type { AgentConfig };

export const DEFAULT_CONFIG_PATH = '/etc/athar/agent.yaml';

/** The validated config, plus the broker password read from its own file. */
export interface LoadedAgentConfig {
  readonly config: AgentConfig;
  readonly mqttPassword: string;
}

/**
 * Reads and validates the agent's YAML config, then its MQTT password file
 * (kept out of the YAML so `agent.yaml` can be committed to a backup without
 * leaking a secret).
 */
export async function loadAgentConfig(
  configPath: string = DEFAULT_CONFIG_PATH,
): Promise<LoadedAgentConfig> {
  let raw: string;

  try {
    raw = await readFile(configPath, 'utf8');
  } catch (error) {
    throw new AgentConfigError(`Could not read ${configPath}: ${describe(error)}.`);
  }

  let document: unknown;

  try {
    document = parseYaml(raw);
  } catch (error) {
    throw new AgentConfigError(`Could not parse ${configPath} as YAML: ${describe(error)}.`);
  }

  const config = parseAgentConfig(document);

  let mqttPassword: string;

  try {
    mqttPassword = (await readFile(config.mqtt.passwordFile, 'utf8')).trim();
  } catch (error) {
    throw new AgentConfigError(
      `Could not read ${config.mqtt.passwordFile}: ${describe(error)}.`,
    );
  }

  if (mqttPassword.length === 0) {
    throw new AgentConfigError(`${config.mqtt.passwordFile} is empty.`);
  }

  return { config, mqttPassword };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
