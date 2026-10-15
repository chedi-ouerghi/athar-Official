import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import type { DrawingJob } from '@athar/contracts';
import { appWrapper, stubClient } from '../../test-utils';
import { apiError, job, JOB_ID, networkError } from '../../test-fixtures';
import { MAX_POLL_DELAY_MS } from './polling';
import { useJob } from './useJob';

const INTERVAL = 1000;

type GetJob = (jobId: string, signal?: AbortSignal) => Promise<DrawingJob>;

/** Advance the clock and let the resulting promises settle inside act. */
async function advance(ms: number): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

function setup(getJob: jest.Mock<GetJob>, options: { active?: boolean } = {}) {
  const client = stubClient({ getJob: getJob as never });

  return renderHook(
    (props: { active: boolean }) => useJob(JOB_ID, { intervalMs: INTERVAL, active: props.active }),
    { wrapper: appWrapper(client), initialProps: { active: options.active ?? true } },
  );
}

describe('useJob', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('fetches at once, then once per interval while the job is active', async () => {
    const getJob = jest.fn<GetJob>().mockResolvedValue(job({ state: 'drawing' }));
    const { result } = setup(getJob);

    await advance(0);
    expect(getJob).toHaveBeenCalledTimes(1);
    expect(result.current.state).toMatchObject({ status: 'ready' });

    await advance(INTERVAL);
    expect(getJob).toHaveBeenCalledTimes(2);

    await advance(INTERVAL);
    expect(getJob).toHaveBeenCalledTimes(3);
  });

  it('does not poll faster than the interval', async () => {
    const getJob = jest.fn<GetJob>().mockResolvedValue(job());
    setup(getJob);

    await advance(0);
    await advance(INTERVAL - 1);

    expect(getJob).toHaveBeenCalledTimes(1);
  });

  it.each(['completed', 'failed', 'cancelled'] as const)(
    'stops polling once the job is %s',
    async (state) => {
      const getJob = jest
        .fn<GetJob>()
        .mockResolvedValueOnce(job({ state: 'drawing' }))
        .mockResolvedValue(job({ state, progress: state === 'completed' ? 1 : 0.5 }));
      const { result } = setup(getJob);

      await advance(0);
      await advance(INTERVAL);
      expect(result.current.state).toMatchObject({ status: 'ready', job: { state } });

      const calls = getJob.mock.calls.length;
      await advance(INTERVAL * 10);

      expect(getJob).toHaveBeenCalledTimes(calls);
    },
  );

  it('does not poll at all while inactive', async () => {
    const getJob = jest.fn<GetJob>().mockResolvedValue(job());
    setup(getJob, { active: false });

    await advance(INTERVAL * 5);

    expect(getJob).not.toHaveBeenCalled();
  });

  it('stops when the screen loses focus or the app goes to the background, and resumes at once', async () => {
    const getJob = jest.fn<GetJob>().mockResolvedValue(job());
    const { rerender } = setup(getJob);

    await advance(0);
    await advance(INTERVAL);
    expect(getJob).toHaveBeenCalledTimes(2);

    rerender({ active: false });
    await advance(INTERVAL * 5);
    expect(getJob).toHaveBeenCalledTimes(2);

    rerender({ active: true });
    await advance(0);
    expect(getJob).toHaveBeenCalledTimes(3);
  });

  it('aborts the request in flight when it becomes inactive or unmounts', async () => {
    const signals: AbortSignal[] = [];
    const getJob = jest.fn<GetJob>().mockImplementation((_id, signal) => {
      if (signal) signals.push(signal);
      return new Promise<DrawingJob>(() => undefined);
    });
    const { rerender, unmount } = setup(getJob);

    await advance(0);
    expect(signals[0]?.aborted).toBe(false);

    rerender({ active: false });
    expect(signals[0]?.aborted).toBe(true);

    rerender({ active: true });
    await advance(0);
    expect(signals[1]?.aborted).toBe(false);

    unmount();
    expect(signals[1]?.aborted).toBe(true);
  });

  it('backs off after repeated connection errors, keeping the last job on screen', async () => {
    const getJob = jest
      .fn<GetJob>()
      .mockResolvedValueOnce(job({ progress: 0.2 }))
      .mockRejectedValue(networkError());
    const { result } = setup(getJob);

    await advance(0); // 1st: ok
    await advance(INTERVAL); // 2nd: fails, next wait 2x
    expect(getJob).toHaveBeenCalledTimes(2);
    expect(result.current.state).toMatchObject({ status: 'ready', trouble: true });

    await advance(INTERVAL * 2 - 1);
    expect(getJob).toHaveBeenCalledTimes(2);
    await advance(1); // 3rd: fails, next wait 4x
    expect(getJob).toHaveBeenCalledTimes(3);

    await advance(INTERVAL * 4 - 1);
    expect(getJob).toHaveBeenCalledTimes(3);
    await advance(1);
    expect(getJob).toHaveBeenCalledTimes(4);

    // The picture of the job is still the last one known.
    expect(result.current.state).toMatchObject({ status: 'ready', job: { progress: 0.2 } });
  });

  it('never waits longer than the cap', async () => {
    const getJob = jest.fn<GetJob>().mockResolvedValueOnce(job()).mockRejectedValue(networkError());
    setup(getJob);

    await advance(0);
    for (let i = 0; i < 8; i += 1) {
      await advance(MAX_POLL_DELAY_MS);
    }
    const calls = getJob.mock.calls.length;
    await advance(MAX_POLL_DELAY_MS);

    expect(getJob).toHaveBeenCalledTimes(calls + 1);
  });

  it('returns to the normal pace and clears the warning after a good answer', async () => {
    const getJob = jest
      .fn<GetJob>()
      .mockResolvedValueOnce(job())
      .mockRejectedValueOnce(networkError())
      .mockResolvedValue(job({ progress: 0.5 }));
    const { result } = setup(getJob);

    await advance(0);
    await advance(INTERVAL); // fails
    await advance(INTERVAL * 2); // recovers
    expect(result.current.state).toMatchObject({ status: 'ready', trouble: false });

    const calls = getJob.mock.calls.length;
    await advance(INTERVAL);
    expect(getJob).toHaveBeenCalledTimes(calls + 1);
  });

  it('reports a job the API does not know as its own state, and stops', async () => {
    const getJob = jest.fn<GetJob>().mockRejectedValue(apiError('JOB_NOT_FOUND', 404));
    const { result } = setup(getJob);

    await advance(0);
    expect(result.current.state).toStrictEqual({ status: 'not-found' });

    await advance(INTERVAL * 10);
    expect(getJob).toHaveBeenCalledTimes(1);
  });

  it('shows an error for a first load that fails, and retries on refresh', async () => {
    const getJob = jest
      .fn<GetJob>()
      .mockRejectedValueOnce(apiError('VALIDATION_FAILED', 400))
      .mockResolvedValue(job());
    const { result } = setup(getJob);

    await advance(0);
    expect(result.current.state.status).toBe('error');

    act(() => {
      result.current.refresh();
    });
    await advance(0);

    expect(result.current.state.status).toBe('ready');
  });

  it('uses a job handed to it, without waiting for the next poll', async () => {
    const getJob = jest.fn<GetJob>().mockResolvedValue(job({ state: 'drawing' }));
    const { result } = setup(getJob);
    await advance(0);

    act(() => {
      result.current.applyJob(job({ state: 'paused', progress: 0.3 }));
    });

    expect(result.current.state).toMatchObject({ status: 'ready', job: { state: 'paused' } });
  });

  it('ignores a poll that was in flight when a command returned a newer job', async () => {
    let answerPoll: (value: DrawingJob) => void = () => undefined;
    const getJob = jest
      .fn<GetJob>()
      .mockResolvedValueOnce(job({ state: 'drawing', updatedAt: '2026-01-01T00:00:00.000Z' }))
      .mockImplementationOnce(
        () =>
          new Promise<DrawingJob>((resolve) => {
            answerPoll = resolve;
          }),
      )
      .mockResolvedValue(job({ state: 'paused', updatedAt: '2026-01-01T00:00:02.000Z' }));
    const { result } = setup(getJob);
    await advance(0);
    await advance(INTERVAL); // the second poll is now in flight

    act(() => {
      result.current.applyJob(job({ state: 'paused', updatedAt: '2026-01-01T00:00:02.000Z' }));
    });
    await act(async () => {
      answerPoll(job({ state: 'drawing', updatedAt: '2026-01-01T00:00:01.000Z' }));
      await Promise.resolve();
    });

    expect(result.current.state).toMatchObject({ status: 'ready', job: { state: 'paused' } });
  });

  it('fetches the new job, and stops showing the old one, when the job id changes', async () => {
    const getJob = jest
      .fn<GetJob>()
      .mockImplementation((jobId) =>
        Promise.resolve(
          jobId === 'job-1'
            ? job({ id: 'job-1', state: 'completed', progress: 1 })
            : job({ id: jobId }),
        ),
      );
    const { result, rerender } = renderHook(
      (props: { jobId: string }) => useJob(props.jobId, { intervalMs: INTERVAL, active: true }),
      {
        wrapper: appWrapper(stubClient({ getJob: getJob as never })),
        initialProps: { jobId: 'job-1' },
      },
    );
    await advance(0);
    expect(result.current.state).toMatchObject({ status: 'ready', job: { id: 'job-1' } });

    rerender({ jobId: 'job-2' });
    expect(result.current.state).toStrictEqual({ status: 'loading' });

    await advance(0);
    expect(getJob).toHaveBeenLastCalledWith('job-2', expect.anything());
    expect(result.current.state).toMatchObject({
      status: 'ready',
      job: { id: 'job-2', state: 'drawing' },
    });
  });

  it('ignores a late command response for the previous job after the job id changes', async () => {
    const getJob = jest
      .fn<GetJob>()
      .mockImplementation((jobId) => Promise.resolve(job({ id: jobId, state: 'drawing' })));
    const { result, rerender } = renderHook(
      (props: { jobId: string }) => useJob(props.jobId, { intervalMs: INTERVAL, active: true }),
      {
        wrapper: appWrapper(stubClient({ getJob: getJob as never })),
        initialProps: { jobId: 'job-1' },
      },
    );
    await advance(0);
    const applyForFirstJob = result.current.applyJob;

    rerender({ jobId: 'job-2' });
    await advance(0);
    act(() => {
      applyForFirstJob(job({ id: 'job-1', state: 'paused' }));
    });

    expect(result.current.state).toMatchObject({
      status: 'ready',
      job: { id: 'job-2', state: 'drawing' },
    });
  });

  it('stops polling when a handed job is terminal', async () => {
    const getJob = jest.fn<GetJob>().mockResolvedValue(job({ state: 'drawing' }));
    const { result } = setup(getJob);
    await advance(0);

    act(() => {
      result.current.applyJob(job({ state: 'cancelled' }));
    });
    const calls = getJob.mock.calls.length;
    await advance(INTERVAL * 5);

    expect(getJob).toHaveBeenCalledTimes(calls);
  });
});
