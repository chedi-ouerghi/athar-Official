import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { DrawingJob } from '@athar/contracts';
import { renderWithApp, stubClient } from '../../test-utils';
import { JOB_ID, apiError, job } from '../../test-fixtures';
import { ResultScreen } from './ResultScreen';

function setup(loaded: () => Promise<DrawingJob>, locale: 'en' | 'ar' = 'en') {
  const handlers = {
    onStillRunning: jest.fn<() => void>(),
    onDrawAgain: jest.fn<() => void>(),
  };

  renderWithApp(
    <ResultScreen jobId={JOB_ID} pollIntervalMs={1000} {...handlers} />,
    stubClient({ getJob: loaded as never }),
    locale,
  );

  return handlers;
}

describe('ResultScreen', () => {
  it('says "Simulated drawing completed" for a completed simulation, with the badge', async () => {
    setup(() => Promise.resolve(job({ state: 'completed', progress: 1, mode: 'simulation' })));

    expect(await screen.findByText('Simulated drawing completed')).toBeTruthy();
    expect(screen.getByText('Simulation')).toBeTruthy();
    expect(
      screen.getByText('This was a simulation. Nothing was drawn on a real table.'),
    ).toBeTruthy();
  });

  it('uses plain wording for a real table', async () => {
    setup(() => Promise.resolve(job({ state: 'completed', progress: 1, mode: 'hardware' })));

    expect(await screen.findByText('Drawing completed')).toBeTruthy();
    expect(screen.getByText('Real table')).toBeTruthy();
    expect(screen.queryByText(/imulat/)).toBeNull();
  });

  it('claims nothing physical for a mode it does not recognise', async () => {
    setup(() => Promise.resolve(job({ state: 'completed', progress: 1, mode: 'odd' as never })));

    expect(await screen.findByText('Unknown mode')).toBeTruthy();
    expect(screen.queryByText(/in the sand/)).toBeNull();
    expect(screen.queryByText(/Simulated/)).toBeNull();
  });

  it('says clearly that a simulated drawing failed, and why', async () => {
    setup(() =>
      Promise.resolve(
        job({ state: 'failed', progress: 0.6, errorCode: 'SIMULATED_FAULT', mode: 'simulation' }),
      ),
    );

    expect(await screen.findByText('The simulated drawing could not be finished')).toBeTruthy();
    expect(screen.getByText('A simulated problem was introduced for testing.')).toBeTruthy();
    expect(screen.getByText('Simulation')).toBeTruthy();
  });

  it('says clearly that a drawing was stopped', async () => {
    setup(() => Promise.resolve(job({ state: 'cancelled', progress: 0.3, mode: 'simulation' })));

    expect(await screen.findByText('The simulated drawing was stopped')).toBeTruthy();
    expect(screen.getByText('You stopped the simulation.')).toBeTruthy();
  });

  it('describes a stopped real drawing without calling it a simulation', async () => {
    setup(() => Promise.resolve(job({ state: 'cancelled', progress: 0.3, mode: 'hardware' })));

    expect(await screen.findByText('The drawing was stopped')).toBeTruthy();
    expect(screen.getByText('What was drawn so far stays as it is.')).toBeTruthy();
  });

  it('draws again by going back to the table', async () => {
    const handlers = setup(() =>
      Promise.resolve(job({ state: 'completed', progress: 1, mode: 'simulation' })),
    );

    fireEvent.press(await screen.findByTestId('result-draw-again'));

    expect(handlers.onDrawAgain).toHaveBeenCalledTimes(1);
  });

  it('sends a drawing that is still running back to the progress screen', async () => {
    const handlers = setup(() => Promise.resolve(job({ state: 'drawing' })));

    await waitFor(() => {
      expect(handlers.onStillRunning).toHaveBeenCalled();
    });
    expect(screen.queryByTestId('result-screen')).toBeNull();
  });

  it('explains a drawing the API no longer knows', async () => {
    const handlers = setup(() => Promise.reject(apiError('JOB_NOT_FOUND', 404)));

    expect(await screen.findByTestId('result-gone')).toBeTruthy();

    fireEvent.press(screen.getByTestId('result-back'));
    expect(handlers.onDrawAgain).toHaveBeenCalledTimes(1);
  });

  it('is written in Arabic', async () => {
    setup(
      () => Promise.resolve(job({ state: 'completed', progress: 1, mode: 'simulation' })),
      'ar',
    );

    expect(await screen.findByText('اكتملت محاكاة الرسم')).toBeTruthy();
    expect(screen.getByText('ارسم مرة أخرى')).toBeTruthy();
  });
});
