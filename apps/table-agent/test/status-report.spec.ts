import { describe, expect, it } from 'vitest';
import { classifyBoardLine, parseStatusReport } from '../src/board/status-report.js';

describe('parseStatusReport', () => {
  it('parses state, MPos and Pn', () => {
    expect(parseStatusReport('<Idle|MPos:10.000,20.500,0.000|FS:0,0|Pn:XY>')).toEqual({
      state: 'Idle',
      mpos: [10, 20.5, 0],
      pins: 'XY',
    });
  });

  it('has no pins when nothing is triggered', () => {
    expect(parseStatusReport('<Idle|MPos:0.000,0.000,0.000>')?.pins).toBeNull();
  });

  it('returns null for a line that is not a realtime report', () => {
    expect(parseStatusReport('ok')).toBeNull();
    expect(parseStatusReport('[MSG:INFO: hi]')).toBeNull();
  });
});

describe('classifyBoardLine', () => {
  it('recognises ok', () => {
    expect(classifyBoardLine('ok')).toEqual({ kind: 'ok' });
  });

  it('recognises error:', () => {
    expect(classifyBoardLine('error:9')).toEqual({ kind: 'error', code: '9' });
  });

  it('recognises ALARM:', () => {
    expect(classifyBoardLine('ALARM:1')).toEqual({ kind: 'alarm', code: '1' });
  });

  it('recognises a realtime report', () => {
    expect(classifyBoardLine('<Run|MPos:1.000,2.000,0.000>').kind).toBe('status');
  });

  it('recognises a [MSG:] banner', () => {
    expect(classifyBoardLine('[MSG:INFO: test]')).toEqual({ kind: 'message', text: '[MSG:INFO: test]' });
  });

  it('falls back to "other" for anything unrecognised', () => {
    expect(classifyBoardLine('Grbl 3.7 FluidNC')).toEqual({ kind: 'other', text: 'Grbl 3.7 FluidNC' });
  });
});
