import { describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import type { DrawingJob, StartJobRequest } from '@athar/contracts';
import { appWrapper, stubClient } from '../../test-utils';
import { TABLE_ID, apiError, job, networkError } from '../../test-fixtures';
import { useStartJob } from './useStartJob';

type StartJob = (tableId: string, request: StartJobRequest) => Promise<DrawingJob>;

function setup(startJob: jest.Mock<StartJob>) {
  const client = stubClient({ startJob: startJob as never });

  return renderHook(() => useStartJob(TABLE_ID, 'dunes'), { wrapper: appWrapper(client) });
}

describe('useStartJob', () => {
  it('starts the design on the table with a request id the API accepts', async () => {
    const startJob = jest.fn<StartJob>().mockResolvedValue(job({ state: 'queued' }));
    const { result } = setup(startJob);

    let started: DrawingJob | undefined;
    await act(async () => {
      started = await result.current.start();
    });

    expect(started?.state).toBe('queued');
    expect(startJob).toHaveBeenCalledWith(TABLE_ID, {
      designId: 'dunes',
      clientRequestId: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown as string,
    });
    expect(result.current.state).toStrictEqual({ status: 'idle' });
  });

  it('sends one request however many times it is called while one is under way', async () => {
    let finish!: (value: DrawingJob) => void;
    const startJob = jest.fn<StartJob>().mockImplementation(
      () =>
        new Promise<DrawingJob>((resolve) => {
          finish = resolve;
        }),
    );
    const { result } = setup(startJob);

    let first!: Promise<DrawingJob | undefined>;
    let second!: Promise<DrawingJob | undefined>;
    let third!: Promise<DrawingJob | undefined>;

    act(() => {
      first = result.current.start();
      second = result.current.start();
      third = result.current.start();
    });

    expect(result.current.state).toStrictEqual({ status: 'starting' });

    await act(async () => {
      finish(job());
      await Promise.all([first, second, third]);
    });

    expect(startJob).toHaveBeenCalledTimes(1);
    await expect(second).resolves.toBeUndefined();
  });

  it('reuses the same request id when the start is retried after a failure', async () => {
    const startJob = jest
      .fn<StartJob>()
      .mockRejectedValueOnce(networkError())
      .mockResolvedValue(job());
    const { result } = setup(startJob);

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state.status).toBe('error');

    await act(async () => {
      await result.current.start();
    });

    const ids = startJob.mock.calls.map(([, request]) => request.clientRequestId);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
  });

  it('keeps the same id for a retry after TABLE_BUSY, so a repeat cannot start two drawings', async () => {
    const startJob = jest
      .fn<StartJob>()
      .mockRejectedValueOnce(apiError('TABLE_BUSY'))
      .mockResolvedValue(job());
    const { result } = setup(startJob);

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.start();
    });

    const [first, second] = startJob.mock.calls.map(([, request]) => request.clientRequestId);
    expect(first).toBe(second);
  });

  it('replaces the id if the API says it was used for another design', async () => {
    const startJob = jest
      .fn<StartJob>()
      .mockRejectedValueOnce(apiError('IDEMPOTENCY_CONFLICT'))
      .mockResolvedValue(job());
    const { result } = setup(startJob);

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.start();
    });

    const [first, second] = startJob.mock.calls.map(([, request]) => request.clientRequestId);
    expect(first).not.toBe(second);
  });

  it('uses a different request id on each new screen', () => {
    const startJob = jest.fn<StartJob>().mockResolvedValue(job());
    const one = setup(startJob);
    const two = setup(startJob);

    return act(async () => {
      await one.result.current.start();
      await two.result.current.start();
    }).then(() => {
      const [first, second] = startJob.mock.calls.map(([, request]) => request.clientRequestId);
      expect(first).not.toBe(second);
    });
  });
});
