import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';
import type { DrawingJob } from '@athar/contracts';
import { renderWithApp, stubClient } from '../../test-utils';
import { FOUR_DESIGNS, JOB_ID, apiError, job } from '../../test-fixtures';
import { JobScreen } from './JobScreen';

type JobCall = (jobId: string) => Promise<DrawingJob>;

async function settle(): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(0);
  });
}

function setup(
  methods: {
    getJob: jest.Mock<JobCall>;
    pauseJob?: jest.Mock<JobCall>;
    resumeJob?: jest.Mock<JobCall>;
    stopJob?: jest.Mock<JobCall>;
  },
  { active = true, locale = 'en' }: { active?: boolean; locale?: 'en' | 'ar' } = {},
) {
  const handlers = {
    onFinished: jest.fn<() => void>(),
    onBackToTable: jest.fn<() => void>(),
  };
  const client = stubClient({
    getJob: methods.getJob as never,
    pauseJob: methods.pauseJob as never,
    resumeJob: methods.resumeJob as never,
    stopJob: methods.stopJob as never,
    getDesign: ((id: string) =>
      Promise.resolve(FOUR_DESIGNS.find((design) => design.id === id))) as never,
  });

  renderWithApp(
    <JobScreen jobId={JOB_ID} active={active} pollIntervalMs={1000} {...handlers} />,
    client,
    locale,
  );

  return handlers;
}

describe('JobScreen', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('shows the percentage, the state in words, and the drawn part following progress', async () => {
    setup({
      getJob: jest.fn<JobCall>().mockResolvedValue(job({ state: 'drawing', progress: 0.5 })),
    });
    await settle();

    expect(screen.getByTestId('job-percent').props.children).toBe('50%');
    expect(screen.getByTestId('job-state').props.children).toBe('Drawing');
    expect(screen.getByTestId('job-preview-drawn')).toBeTruthy();
    expect(screen.getByTestId('job-preview').props.accessibilityLabel).toBe(
      'Design preview, 50% drawn',
    );
  });

  it('shows a rake job without a preview, without fetching a design, and without an error', async () => {
    const getDesign = jest.fn<(id: string) => Promise<never>>();
    const client = stubClient({
      getJob: (() => Promise.resolve(job({ kind: 'rake', designId: null }))) as never,
      getDesign: getDesign as never,
    });
    renderWithApp(
      <JobScreen
        jobId={JOB_ID}
        active
        pollIntervalMs={1000}
        onFinished={jest.fn<() => void>()}
        onBackToTable={jest.fn<() => void>()}
      />,
      client,
      'en',
    );
    await settle();

    expect(screen.getByTestId('job-percent').props.children).toBe('25%');
    expect(screen.queryByTestId('job-preview')).toBeNull();
    expect(screen.queryByTestId('job-error')).toBeNull();
    expect(screen.queryByTestId('job-command-error')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(getDesign).not.toHaveBeenCalled();
  });

  it('updates as the job progresses', async () => {
    const getJob = jest
      .fn<JobCall>()
      .mockResolvedValueOnce(job({ progress: 0.2 }))
      .mockResolvedValue(job({ progress: 0.7 }));
    setup({ getJob });
    await settle();
    expect(screen.getByTestId('job-percent').props.children).toBe('20%');

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });

    expect(screen.getByTestId('job-percent').props.children).toBe('70%');
  });

  it('offers Pause and Stop while drawing, and Resume and Stop while paused', async () => {
    const getJob = jest.fn<JobCall>().mockResolvedValue(job({ state: 'drawing' }));
    const pauseJob = jest.fn<JobCall>().mockResolvedValue(job({ state: 'paused', progress: 0.3 }));
    setup({ getJob, pauseJob });
    await settle();

    expect(screen.getByTestId('job-pause')).toBeTruthy();
    expect(screen.queryByTestId('job-resume')).toBeNull();

    fireEvent.press(screen.getByTestId('job-pause'));
    await settle();

    // The command's own answer is used: the job was not read again.
    expect(getJob).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('job-state').props.children).toBe('Paused');
    expect(screen.getByTestId('job-resume')).toBeTruthy();
    expect(screen.queryByTestId('job-pause')).toBeNull();
    expect(screen.getByTestId('job-stop')).toBeTruthy();
  });

  it('resumes a paused drawing', async () => {
    const getJob = jest.fn<JobCall>().mockResolvedValue(job({ state: 'paused' }));
    const resumeJob = jest.fn<JobCall>().mockResolvedValue(job({ state: 'drawing' }));
    setup({ getJob, resumeJob });
    await settle();

    fireEvent.press(screen.getByTestId('job-resume'));
    await settle();

    expect(resumeJob).toHaveBeenCalledWith(JOB_ID);
    expect(screen.getByTestId('job-state').props.children).toBe('Drawing');
  });

  it('asks before stopping, and stops only when confirmed', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const stopJob = jest
      .fn<JobCall>()
      .mockResolvedValue(job({ state: 'cancelled', progress: 0.3 }));
    setup({ getJob: jest.fn<JobCall>().mockResolvedValue(job()), stopJob });
    await settle();

    fireEvent.press(screen.getByTestId('job-stop'));

    expect(alert).toHaveBeenCalledTimes(1);
    expect(stopJob).not.toHaveBeenCalled();

    const buttons = alert.mock.calls[0]?.[2] ?? [];
    const confirm = buttons.find((button) => button.style === 'destructive');
    expect(buttons.find((button) => button.style === 'cancel')?.text).toBe('Keep drawing');

    await act(async () => {
      confirm?.onPress?.();
      await Promise.resolve();
    });

    expect(stopJob).toHaveBeenCalledTimes(1);
  });

  it('does not stop when the confirmation is dismissed', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const stopJob = jest.fn<JobCall>();
    setup({ getJob: jest.fn<JobCall>().mockResolvedValue(job()), stopJob });
    await settle();

    fireEvent.press(screen.getByTestId('job-stop'));
    await settle();

    expect(stopJob).not.toHaveBeenCalled();
  });

  it('refreshes the job when a command is refused as INVALID_TRANSITION', async () => {
    const getJob = jest
      .fn<JobCall>()
      .mockResolvedValueOnce(job({ state: 'drawing' }))
      .mockResolvedValue(job({ state: 'completed', progress: 1 }));
    const pauseJob = jest.fn<JobCall>().mockRejectedValue(apiError('INVALID_TRANSITION'));
    const handlers = setup({ getJob, pauseJob });
    await settle();

    fireEvent.press(screen.getByTestId('job-pause'));
    await settle();

    // No error is shown to the visitor; the screen simply catches up.
    expect(screen.queryByTestId('job-command-error')).toBeNull();
    expect(getJob).toHaveBeenCalledTimes(2);
    expect(handlers.onFinished).toHaveBeenCalled();
  });

  it('shows a plain message when a command fails for another reason', async () => {
    const pauseJob = jest.fn<JobCall>().mockRejectedValue(apiError('TABLE_OFFLINE'));
    setup({ getJob: jest.fn<JobCall>().mockResolvedValue(job()), pauseJob });
    await settle();

    fireEvent.press(screen.getByTestId('job-pause'));
    await settle();

    expect(screen.getByTestId('job-command-error')).toBeTruthy();
    expect(
      screen.getByText('This table cannot be reached right now. Please try again later.'),
    ).toBeTruthy();
  });

  it('goes to the result once, when the job finishes', async () => {
    const getJob = jest
      .fn<JobCall>()
      .mockResolvedValueOnce(job({ state: 'drawing' }))
      .mockResolvedValue(job({ state: 'completed', progress: 1 }));
    const handlers = setup({ getJob });
    await settle();
    expect(handlers.onFinished).not.toHaveBeenCalled();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5000);
    });

    expect(handlers.onFinished).toHaveBeenCalledTimes(1);
    expect(getJob).toHaveBeenCalledTimes(2);
  });

  it('shows "no longer available" for a job the API forgot, with a way back', async () => {
    const handlers = setup({
      getJob: jest.fn<JobCall>().mockRejectedValue(apiError('JOB_NOT_FOUND', 404)),
    });
    await settle();

    expect(screen.getByTestId('job-gone')).toBeTruthy();
    expect(screen.getByText('This drawing is no longer available')).toBeTruthy();

    fireEvent.press(screen.getByTestId('job-back'));
    expect(handlers.onBackToTable).toHaveBeenCalledTimes(1);
  });

  it('keeps the last job on screen with a notice when the connection drops', async () => {
    const { networkError } =
      jest.requireActual<typeof import('../../test-fixtures')>('../../test-fixtures');
    const getJob = jest
      .fn<JobCall>()
      .mockResolvedValueOnce(job({ progress: 0.4 }))
      .mockRejectedValue(networkError());
    setup({ getJob });
    await settle();

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1000);
    });

    expect(screen.getByTestId('job-percent').props.children).toBe('40%');
    expect(screen.getByTestId('job-trouble')).toBeTruthy();
  });

  it('does not fetch while the screen is not active', async () => {
    const getJob = jest.fn<JobCall>().mockResolvedValue(job());
    setup({ getJob }, { active: false });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5000);
    });

    expect(getJob).not.toHaveBeenCalled();
  });

  it('is written in Arabic', async () => {
    setup(
      { getJob: jest.fn<JobCall>().mockResolvedValue(job({ state: 'paused' })) },
      { locale: 'ar' },
    );
    await settle();

    expect(screen.getByTestId('job-state').props.children).toBe('متوقف مؤقتًا');
    expect(screen.getByText('متابعة')).toBeTruthy();
  });
});
