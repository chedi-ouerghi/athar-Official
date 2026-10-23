/**
 * Parsing FluidNC's line-based protocol over USB serial: a realtime status
 * report (`<State|MPos:x,y,z|Pn:XY|...>`), a line reply (`ok` / `error:<n>`),
 * an asynchronous alarm (`ALARM:<n>`), or an informational banner
 * (`[MSG:...]`), as described in `hardware/TESTING.md` and
 * `hardware/GUIDE-EQUIPE-DUBAI.md` (step E4).
 */

export interface StatusReport {
  /** `Idle`, `Run`, `Hold`, `Alarm`, `Home`, `Jog`, `Door`, `Sleep`, `Check`, or an unknown future one. */
  readonly state: string;
  /** `[X, Y, Z]` in the board's own units (degrees for X, mm for Y here). */
  readonly mpos: readonly [number, number, number] | null;
  /** Raw value of the `Pn:` field (e.g. `"XY"`), or `null` when no pin is active. */
  readonly pins: string | null;
}

/** Parses one `<...>` realtime report line, or `null` if it is not one. */
export function parseStatusReport(line: string): StatusReport | null {
  const trimmed = line.trim();

  if (!trimmed.startsWith('<') || !trimmed.endsWith('>')) {
    return null;
  }

  const fields = trimmed.slice(1, -1).split('|');
  const state = fields[0];

  if (state === undefined || state.length === 0) {
    return null;
  }

  let mpos: readonly [number, number, number] | null = null;
  let pins: string | null = null;

  for (const field of fields.slice(1)) {
    if (field.startsWith('MPos:')) {
      const parts = field
        .slice('MPos:'.length)
        .split(',')
        .map((part) => Number(part));

      if (parts.length >= 2 && parts.every((part) => Number.isFinite(part))) {
        mpos = [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
      }
    } else if (field.startsWith('Pn:')) {
      pins = field.slice('Pn:'.length);
    }
  }

  return { state, mpos, pins };
}

export type BoardLine =
  | { readonly kind: 'ok' }
  | { readonly kind: 'error'; readonly code: string }
  | { readonly kind: 'alarm'; readonly code: string }
  | { readonly kind: 'status'; readonly report: StatusReport }
  | { readonly kind: 'message'; readonly text: string }
  | { readonly kind: 'other'; readonly text: string };

/** Classifies one line received from the board. */
export function classifyBoardLine(raw: string): BoardLine {
  const line = raw.trim();

  if (line === 'ok') {
    return { kind: 'ok' };
  }

  if (line.startsWith('error:')) {
    return { kind: 'error', code: line.slice('error:'.length).trim() };
  }

  if (line.startsWith('ALARM:')) {
    return { kind: 'alarm', code: line.slice('ALARM:'.length).trim() };
  }

  const report = parseStatusReport(line);

  if (report !== null) {
    return { kind: 'status', report };
  }

  if (line.startsWith('[')) {
    return { kind: 'message', text: line };
  }

  return { kind: 'other', text: line };
}
