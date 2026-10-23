import { describe, expect, it } from 'vitest';
import { BoardLineError } from '../src/board/board-port.js';
import { FakeBoardPort } from '../src/board/fake-board-port.js';
import { streamGcode } from '../src/motion/gcode-stream.js';

describe('streamGcode', () => {
  it('never keeps more than plannerBufferLines lines in flight at once', async () => {
    const board = new FakeBoardPort();
    await board.open();

    let inFlight = 0;
    let maxInFlight = 0;
    const originalSendLine = board.sendLine.bind(board);
    board.sendLine = (line: string) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);

      return originalSendLine(line).finally(() => {
        inFlight -= 1;
      });
    };

    const lines = Array.from({ length: 50 }, (_, index) => `G1 X${index} Y0`);
    await streamGcode(board, lines, { plannerBufferLines: 5 });

    expect(maxInFlight).toBeLessThanOrEqual(5);
  });

  it('calls onSent for every line, in order, once each is acknowledged', async () => {
    const board = new FakeBoardPort();
    await board.open();
    const sent: number[] = [];

    await streamGcode(board, ['G1 X1 Y0', 'G1 X2 Y0', 'G1 X3 Y0'], {
      plannerBufferLines: 2,
      onSent: (index) => sent.push(index),
    });

    expect(sent).toEqual([0, 1, 2]);
  });

  it('rejects with BoardLineError when the board answers error:, without hanging', async () => {
    const board = new FakeBoardPort();
    await board.open();
    board.queueFault({ kind: 'error', code: '20' });

    await expect(
      streamGcode(board, ['G1 X1 Y0', 'G1 X2 Y0'], { plannerBufferLines: 4 }),
    ).rejects.toBeInstanceOf(BoardLineError);
  });

  it('streams nothing for an empty line list', async () => {
    const board = new FakeBoardPort();
    await board.open();

    await expect(streamGcode(board, [], { plannerBufferLines: 4 })).resolves.toBeUndefined();
  });
});
