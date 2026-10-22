import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import type { DesignDetail, DrawingJob } from '@athar/contracts';
import { renderWithApp, stubClient } from '../../test-utils';
import { JOB_ID, TABLE_ID, apiError, design, job, networkError, table } from '../../test-fixtures';
import { DesignScreen } from './DesignScreen';

type StartJob = (tableId: string, request: { clientRequestId: string }) => Promise<DrawingJob>;

function setup(
  startJob: jest.Mock<StartJob>,
  {
    detail = design('dunes'),
    getTable = () => Promise.resolve(table()),
    locale = 'en' as const,
  }: {
    detail?: DesignDetail;
    getTable?: () => Promise<unknown>;
    locale?: 'en' | 'ar';
  } = {},
) {
  const handlers = {
    onStarted: jest.fn<(started: DrawingJob) => void>(),
    onWatchJob: jest.fn<(jobId: string) => void>(),
  };
  const client = stubClient({
    getDesign: (() => Promise.resolve(detail)) as never,
    getTable: getTable as never,
    startJob: startJob as never,
  });

  renderWithApp(<DesignScreen tableId={TABLE_ID} designId="dunes" {...handlers} />, client, locale);

  return handlers;
}

describe('DesignScreen', () => {
  it('shows the preview, title, description, duration and no inspiration card', async () => {
    setup(jest.fn<StartJob>());

    expect(await screen.findByText('Design dunes')).toBeTruthy();
    expect(screen.getByText('About dunes.')).toBeTruthy();
    expect(screen.getByTestId('design-preview')).toBeTruthy();
    expect(screen.queryByTestId('design-inspiration-label')).toBeNull();
    expect(screen.getByTestId('design-duration').props.children).toBe('About 3 min');
    expect(screen.getByText('Start drawing')).toBeTruthy();
  });

  it('shows the Arabic title and button in Arabic', async () => {
    setup(jest.fn<StartJob>(), { locale: 'ar' });

    expect(await screen.findByText('تصميم dunes')).toBeTruthy();
    expect(screen.getByText('ابدأ الرسم')).toBeTruthy();
  });

  it('starts the drawing and hands the job on', async () => {
    const started = job({ state: 'queued', progress: 0 });
    const startJob = jest.fn<StartJob>().mockResolvedValue(started);
    const handlers = setup(startJob);

    fireEvent.press(await screen.findByTestId('design-start'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(startJob).toHaveBeenCalledTimes(1);
    expect(handlers.onStarted).toHaveBeenCalledTimes(1);
    expect(handlers.onStarted).toHaveBeenCalledWith(started);
  });

  it('cannot send twice: a double tap starts one drawing', async () => {
    let finish!: (value: DrawingJob) => void;
    const startJob = jest.fn<StartJob>().mockImplementation(
      () =>
        new Promise<DrawingJob>((resolve) => {
          finish = resolve;
        }),
    );
    const handlers = setup(startJob);
    const button = await screen.findByTestId('design-start');

    fireEvent.press(button);
    fireEvent.press(button);
    fireEvent.press(button);

    expect(startJob).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('design-start').props.accessibilityState).toMatchObject({
      busy: true,
      disabled: true,
    });

    await act(async () => {
      finish(job());
      await Promise.resolve();
    });

    expect(handlers.onStarted).toHaveBeenCalledTimes(1);
  });

  it('retries with the same request id after a connection error', async () => {
    const startJob = jest
      .fn<StartJob>()
      .mockRejectedValueOnce(networkError())
      .mockResolvedValue(job());
    setup(startJob);

    fireEvent.press(await screen.findByTestId('design-start'));
    expect(await screen.findByTestId('design-start-error')).toBeTruthy();
    expect(
      screen.getByText('We could not connect. Check your internet connection and try again.'),
    ).toBeTruthy();

    fireEvent.press(screen.getByTestId('design-start'));
    await act(async () => {
      await Promise.resolve();
    });

    const [first, second] = startJob.mock.calls.map(([, request]) => request.clientRequestId);
    expect(startJob).toHaveBeenCalledTimes(2);
    expect(first).toBe(second);
  });

  it('for TABLE_BUSY, says so and offers the running drawing', async () => {
    const startJob = jest.fn<StartJob>().mockRejectedValue(apiError('TABLE_BUSY'));
    const getTable = jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce(table())
      .mockResolvedValue(table({ connection: 'busy', activeJobId: JOB_ID }));
    const handlers = setup(startJob, { getTable });

    fireEvent.press(await screen.findByTestId('design-start'));

    expect(
      await screen.findByText('This table is already drawing. Please wait for it to finish.'),
    ).toBeTruthy();

    const watch = await screen.findByTestId('design-watch');
    fireEvent.press(watch);

    expect(handlers.onWatchJob).toHaveBeenCalledTimes(1);
    expect(handlers.onWatchJob).toHaveBeenCalledWith(JOB_ID);
  });

  const refusals: [Parameters<typeof apiError>[0], string][] = [
    ['TABLE_DISABLED', 'This table is switched off right now.'],
    ['TABLE_OFFLINE', 'This table cannot be reached right now. Please try again later.'],
    ['IDEMPOTENCY_CONFLICT', 'Something went wrong. Please try again.'],
  ];

  it.each(refusals)('explains %s in plain words', async (code, message) => {
    setup(jest.fn<StartJob>().mockRejectedValue(apiError(code)));

    fireEvent.press(await screen.findByTestId('design-start'));

    expect(await screen.findByText(message)).toBeTruthy();
    expect(screen.queryByTestId('design-watch')).toBeNull();
  });

  it('lets the visitor try again after a refusal', async () => {
    const startJob = jest
      .fn<StartJob>()
      .mockRejectedValueOnce(apiError('TABLE_OFFLINE'))
      .mockResolvedValue(job());
    const handlers = setup(startJob);

    fireEvent.press(await screen.findByTestId('design-start'));
    await screen.findByTestId('design-start-error');
    fireEvent.press(screen.getByTestId('design-start'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(handlers.onStarted).toHaveBeenCalledTimes(1);
  });
});
