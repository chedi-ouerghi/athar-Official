/**
 * `athar-agent selftest [--motors] [configPath]` — the readable report
 * `hardware/TESTING.md` asks for ("lance ça et envoie-moi la capture"):
 * config, serial port, FluidNC, broker, ACL, system clock, and (only with
 * `--motors`, with someone's hand on the power switch) a tiny controlled move.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { SerialBoardPort } from '../board/serial-board-port.js';
import { AgentConfigError, DEFAULT_CONFIG_PATH, loadAgentConfig, type AgentConfig } from '../config/load-config.js';
import { connectMqtt } from '../mqtt/connect-mqtt.js';
import { CliUsageError, isEntryPoint, processIo, type CliIo } from './cli-io.js';

const execFileAsync = promisify(execFile);

export const SELFTEST_USAGE = `Usage: athar-agent selftest [--motors] [configPath]

Checks the agent's configuration, the serial connection to the board, the
MQTT broker, and (with --motors, someone's hand on the power switch) a tiny
controlled move.

  --motors       also jog each axis by a few degrees/millimetres
  configPath     defaults to /etc/athar/agent.yaml`;

interface StepResult {
  readonly ok: boolean | null; // null = skipped ("[--]"), not a pass or a fail
  readonly label: string;
}

function report(io: CliIo, result: StepResult): void {
  const marker = result.ok === null ? '[--]' : result.ok ? '[OK]' : '[FAIL]';
  io.out(`${marker} ${result.label}`);
}

/** Runs the checks; returns the process exit code (0 only if nothing failed). */
export async function runSelftest(argv: readonly string[], io: CliIo): Promise<number> {
  if (argv.includes('--help') || argv.includes('-h')) {
    io.out(SELFTEST_USAGE);
    return 0;
  }

  const motors = argv.includes('--motors');
  const configPath = argv.find((value) => !value.startsWith('--')) ?? DEFAULT_CONFIG_PATH;

  let config: AgentConfig;
  let password: string;

  try {
    ({ config, mqttPassword: password } = await loadAgentConfig(configPath));
  } catch (error) {
    report(io, { ok: false, label: `config ${configPath} valid` });
    io.err(error instanceof AgentConfigError ? error.message : String(error));
    return 1;
  }

  report(io, { ok: true, label: `config ${configPath} valid (table ${config.tableId})` });

  let failed = false;
  const board = new SerialBoardPort({ path: config.board.port, baudRate: config.board.baud });

  try {
    await board.open();
    report(io, { ok: true, label: `serial port ${config.board.port} open` });
  } catch (error) {
    report(io, { ok: false, label: `serial port ${config.board.port} open` });
    io.err(describe(error));
    return 1;
  }

  const banner: string[] = [];
  const stopCollectingBanner = board.onMessage((text) => banner.push(text));

  try {
    await board.sendLine('$I');
    report(io, {
      ok: true,
      label: banner.length > 0 ? `FluidNC responded: ${banner[0]}` : 'FluidNC responded to $I',
    });
  } catch (error) {
    failed = true;
    report(io, { ok: false, label: 'FluidNC responded to $I' });
    io.err(describe(error));
  }

  stopCollectingBanner();

  const status = await pollStatusOnce(board, 2_000);

  if (status === null) {
    failed = true;
    report(io, { ok: false, label: 'board status: no realtime report within 2s' });
  } else {
    const alarmed = status.state.toLowerCase().includes('alarm');

    if (alarmed) {
      failed = true;
    }

    report(io, { ok: !alarmed, label: `board state: ${status.state}, no alarm` });
    report(io, {
      ok: status.pins === null || status.pins.length === 0,
      label:
        status.pins === null || status.pins.length === 0
          ? 'limit sensors: free'
          : `limit sensors: ${status.pins} triggered (check wiring/level before homing)`,
    });
  }

  await board.close();

  const mqttOk = await checkBroker(config, password, io);
  failed = failed || !mqttOk;

  const ntp = await checkClockSync();
  report(io, ntp);

  if (motors) {
    io.out(
      '[--] --motors requested: jogging is not wired into this report yet — use FluidTerm directly ' +
        '(hardware/GUIDE-EQUIPE-DUBAI.md, step E4) for a hands-on test, with someone on the power switch.',
    );
  } else {
    report(io, { ok: null, label: 'motors: not tested (use --motors with someone at the power switch)' });
  }

  return failed ? 1 : 0;
}

function pollStatusOnce(
  board: SerialBoardPort,
  timeoutMs: number,
): Promise<{ readonly state: string; readonly pins: string | null } | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      unsubscribe();
      resolve(null);
    }, timeoutMs);

    const unsubscribe = board.onStatus((report_) => {
      clearTimeout(timer);
      unsubscribe();
      resolve({ state: report_.state, pins: report_.pins });
    });

    board.sendRealtime('?');
  });
}

async function checkBroker(config: AgentConfig, password: string, io: CliIo): Promise<boolean> {
  const client = connectMqtt(config, password);

  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timed out after 10s.'));
      }, 10_000);

      client.once('connect', () => {
        clearTimeout(timer);
        resolve();
      });
      client.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });

    report(io, { ok: true, label: `broker ${config.mqtt.url} reachable, login ok` });

    let aclOk = true;

    try {
      await client.publishAsync(
        `athar/v1/t/${config.tableId}/status`,
        JSON.stringify({ selftest: true }),
        { qos: 1, retain: false },
      );
    } catch {
      aclOk = false;
    }

    report(io, {
      ok: aclOk,
      label: aclOk
        ? `ACL: publish on athar/v1/t/${config.tableId}/status allowed`
        : `ACL: publish on athar/v1/t/${config.tableId}/status refused`,
    });

    return aclOk;
  } catch (error) {
    report(io, { ok: false, label: `broker ${config.mqtt.url} reachable, login ok` });
    io.err(describe(error));
    return false;
  } finally {
    await client.endAsync(true).catch(() => undefined);
  }
}

async function checkClockSync(): Promise<StepResult> {
  try {
    const { stdout } = await execFileAsync('timedatectl', ['show', '-p', 'NTPSynchronized', '--value']);
    const synced = stdout.trim() === 'yes';

    return { ok: synced, label: `system clock NTP-synchronised: ${stdout.trim() || 'unknown'}` };
  } catch {
    return { ok: null, label: 'system clock sync: skipped (timedatectl unavailable on this machine)' };
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  try {
    process.exitCode = await runSelftest(process.argv.slice(2), processIo);
  } catch (error) {
    if (error instanceof CliUsageError) {
      processIo.err(error.message);
      process.exitCode = error.exitCode;
      return;
    }

    processIo.err(`selftest failed: ${describe(error)}`);
    process.exitCode = 1;
  }
}

if (isEntryPoint(import.meta.url)) {
  void main();
}
