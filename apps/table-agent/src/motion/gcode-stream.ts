/**
 * Streams G-code lines to a `BoardPort`, keeping at most `plannerBufferLines`
 * lines "in flight" without an `ok` — the flow-control rule from
 * `hardware/table-agent/agent.example.yaml` (`planner_buffer_lines`).
 *
 * `BoardPort.sendLine` already resolves/rejects per line (FIFO against the
 * board's replies); this only bounds concurrency and reports progress.
 */

import type { BoardPort } from '../board/board-port.js';

export interface StreamGcodeOptions {
  readonly plannerBufferLines: number;
  /** Called once a line has been acknowledged (`ok`), with its index. */
  readonly onSent?: (index: number) => void;
}

/**
 * Resolves once every line has been acknowledged. Rejects on the first
 * `error:`/`ALARM:`/disconnect/cancellation, having already stopped sending
 * further lines (whatever was already in flight may still settle after).
 */
export async function streamGcode(
  board: BoardPort,
  lines: readonly string[],
  options: StreamGcodeOptions,
): Promise<void> {
  const { plannerBufferLines, onSent } = options;
  let nextIndex = 0;
  const inFlight = new Set<Promise<void>>();

  while (nextIndex < lines.length || inFlight.size > 0) {
    while (inFlight.size < plannerBufferLines && nextIndex < lines.length) {
      const index = nextIndex;
      const line = lines[index];
      nextIndex += 1;

      if (line === undefined) {
        continue;
      }

      const settled = board.sendLine(line).then(() => {
        onSent?.(index);
      });

      inFlight.add(settled);
      // The tracked promise above is awaited (directly, or via Promise.race
      // below); this sibling only silences the unhandled-rejection warning on
      // the bookkeeping chain once the tracked one has already been handled.
      settled.finally(() => inFlight.delete(settled)).catch(() => undefined);
    }

    if (inFlight.size > 0) {
      await Promise.race(inFlight);
    }
  }
}
