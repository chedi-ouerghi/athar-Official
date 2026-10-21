import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderWithApp, stubClient } from '../../test-utils';
import { FOUR_DESIGNS, JOB_ID, TABLE_ID, apiError, networkError, table } from '../../test-fixtures';
import { TableScreen } from './TableScreen';

function setup(
  getTable: () => Promise<unknown>,
  {
    locale = 'en',
    listDesigns = () => Promise.resolve({ collectionVersion: 1, designs: FOUR_DESIGNS }),
  }: { locale?: 'en' | 'ar'; listDesigns?: () => Promise<unknown> } = {},
) {
  const handlers = {
    onOpenDesign: jest.fn<(designId: string) => void>(),
    onWatchJob: jest.fn<(jobId: string) => void>(),
    onScanAnother: jest.fn<() => void>(),
  };
  const client = stubClient({
    getTable: getTable as never,
    listDesigns: listDesigns as never,
    getDesign: ((id: string) =>
      Promise.resolve(FOUR_DESIGNS.find((candidate) => candidate.id === id))) as never,
  });

  renderWithApp(<TableScreen tableId={TABLE_ID} {...handlers} />, client, locale);

  return handlers;
}

describe('TableScreen', () => {
  it('shows a loading state first', () => {
    setup(() => new Promise(() => undefined));

    expect(screen.getByTestId('table-loading')).toBeTruthy();
  });

  it('shows the table, the Simulation badge, its status in plain words, and the four designs', async () => {
    const handlers = setup(() => Promise.resolve(table()));

    expect(await screen.findByText('Main hall')).toBeTruthy();
    expect(screen.getByText('Ground floor')).toBeTruthy();
    expect(screen.getByText('Simulation')).toBeTruthy();
    expect(screen.getByTestId('table-connection').props.children).toBe('Status: Ready to draw');

    for (const id of ['dunes', 'khoos', 'sadu', 'star']) {
      expect(await screen.findByTestId(`design-${id}`)).toBeTruthy();
    }
    expect(screen.getByText('Design dunes')).toBeTruthy();

    fireEvent.press(screen.getByTestId('design-khoos'));
    expect(handlers.onOpenDesign).toHaveBeenCalledTimes(1);
    expect(handlers.onOpenDesign).toHaveBeenCalledWith('khoos');
  });

  it('draws each design preview from its previewPath', async () => {
    setup(() => Promise.resolve(table()));

    await waitFor(() => {
      expect(screen.getByTestId('design-dunes-preview-full')).toBeTruthy();
    });
    expect(String(screen.getByTestId('design-dunes-preview-full').props.d)).toMatch(/^M/);
  });

  it('shows the badge as fail-closed when the mode is not one we know', async () => {
    setup(() => Promise.resolve(table({ mode: 'weird' as never })));

    expect(await screen.findByText('Unknown mode')).toBeTruthy();
    expect(screen.queryByText('Simulation')).toBeNull();
  });

  it('explains an unknown table, and offers to scan another code', async () => {
    const handlers = setup(() => Promise.reject(apiError('TABLE_NOT_FOUND', 404)));

    expect(await screen.findByTestId('table-unknown')).toBeTruthy();
    expect(screen.getByText('Table not found')).toBeTruthy();
    expect(screen.queryByTestId('design-dunes')).toBeNull();

    fireEvent.press(screen.getByTestId('table-scan-another'));
    expect(handlers.onScanAnother).toHaveBeenCalledTimes(1);
  });

  it('explains a switched-off table and offers no designs', async () => {
    setup(() => Promise.resolve(table({ enabled: false })));

    expect(await screen.findByTestId('table-disabled')).toBeTruthy();
    expect(screen.getByText('This table is switched off')).toBeTruthy();
    expect(screen.queryByTestId('design-dunes')).toBeNull();
    expect(screen.getByText('Main hall')).toBeTruthy();
    // Found on the emulator: the status line used to say "Ready to draw" here, which
    // contradicted the notice under it.
    expect(screen.getByTestId('table-connection').props.children).toBe('Status: Switched off');
  });

  it('explains an offline table, and checks again on request', async () => {
    const getTable = jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce(table({ connection: 'offline' }))
      .mockResolvedValue(table());
    setup(getTable);

    expect(await screen.findByTestId('table-offline')).toBeTruthy();
    expect(screen.getByTestId('table-connection').props.children).toBe('Status: Offline');
    expect(screen.queryByTestId('design-dunes')).toBeNull();

    fireEvent.press(screen.getByTestId('table-offline-retry'));

    expect(await screen.findByTestId('design-dunes')).toBeTruthy();
    expect(getTable).toHaveBeenCalledTimes(2);
  });

  it('for a busy table, offers to open the running drawing', async () => {
    const handlers = setup(() =>
      Promise.resolve(table({ connection: 'busy', activeJobId: JOB_ID })),
    );

    expect(await screen.findByTestId('table-busy')).toBeTruthy();
    expect(screen.queryByTestId('design-dunes')).toBeNull();

    fireEvent.press(screen.getByTestId('table-watch'));
    expect(handlers.onWatchJob).toHaveBeenCalledTimes(1);
    expect(handlers.onWatchJob).toHaveBeenCalledWith(JOB_ID);
  });

  it('for a busy table with no known drawing, only offers to check again', async () => {
    setup(() => Promise.resolve(table({ connection: 'busy', activeJobId: null })));

    expect(await screen.findByTestId('table-busy-retry')).toBeTruthy();
    expect(screen.queryByTestId('table-watch')).toBeNull();
  });

  it('shows a connection error with a retry that works, and no technical words', async () => {
    const getTable = jest
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(networkError())
      .mockResolvedValue(table());
    setup(getTable);

    expect(await screen.findByTestId('table-error')).toBeTruthy();
    expect(
      screen.getByText('We could not connect. Check your internet connection and try again.'),
    ).toBeTruthy();
    expect(screen.queryByText(/raw|network|server|api/i)).toBeNull();

    fireEvent.press(screen.getByTestId('table-error-retry'));

    expect(await screen.findByText('Main hall')).toBeTruthy();
  });

  it('shows a designs error with its own retry, without hiding the table', async () => {
    const listDesigns = jest
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(networkError())
      .mockResolvedValue({ collectionVersion: 1, designs: FOUR_DESIGNS });
    setup(() => Promise.resolve(table()), { listDesigns });

    expect(await screen.findByTestId('designs-error')).toBeTruthy();
    expect(screen.getByText('Main hall')).toBeTruthy();

    fireEvent.press(screen.getByTestId('designs-error-retry'));

    expect(await screen.findByTestId('design-dunes')).toBeTruthy();
  });

  it('reads the table again when the screen comes back into view, without blanking it', async () => {
    // Found on the emulator: after a drawing, "Draw again" returns to a table screen
    // that is still mounted, which kept saying "Ready to draw" while the table was busy.
    const getTable = jest
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce(table())
      .mockResolvedValue(table({ connection: 'busy', activeJobId: JOB_ID }));
    const client = stubClient({
      getTable: getTable as never,
      listDesigns: (() =>
        Promise.resolve({ collectionVersion: 1, designs: FOUR_DESIGNS })) as never,
      getDesign: ((id: string) =>
        Promise.resolve(FOUR_DESIGNS.find((candidate) => candidate.id === id))) as never,
    });
    const props = {
      tableId: TABLE_ID,
      onOpenDesign: jest.fn<(designId: string) => void>(),
      onWatchJob: jest.fn<(jobId: string) => void>(),
      onScanAnother: jest.fn<() => void>(),
    };

    const view = renderWithApp(<TableScreen {...props} active />, client);
    expect(await screen.findByTestId('design-dunes')).toBeTruthy();

    view.rerender(<TableScreen {...props} active={false} />);
    expect(getTable).toHaveBeenCalledTimes(1);

    view.rerender(<TableScreen {...props} active />);

    // The old table stays on screen until the new answer replaces it.
    expect(screen.queryByTestId('table-loading')).toBeNull();
    expect(await screen.findByTestId('table-busy')).toBeTruthy();
    expect(getTable).toHaveBeenCalledTimes(2);
  });

  it('is written in Arabic, with the Arabic design titles', async () => {
    setup(() => Promise.resolve(table()), { locale: 'ar' });

    expect(await screen.findByText('محاكاة')).toBeTruthy();
    expect(await screen.findByText('تصميم dunes')).toBeTruthy();
    expect(screen.getByText('اختر تصميمًا')).toBeTruthy();
  });
});

describe('TableScreen: what each role is shown', () => {
  const personalized = (role: 'owner' | 'guest' | 'admin') =>
    table({
      plan: 'personalized',
      features: ['catalogue', 'rake', 'drawingPen', 'ledAmbiences'],
      access: { role },
    });

  it('shows an owner the light and the invitation', async () => {
    setup(() => Promise.resolve(personalized('owner')));

    expect(await screen.findByTestId('light-control')).toBeTruthy();
    expect(screen.getByTestId('share-control')).toBeTruthy();
  });

  it('shows a guest the light but no way to invite anyone', async () => {
    setup(() => Promise.resolve(personalized('guest')));

    expect(await screen.findByTestId('light-control')).toBeTruthy();
    expect(screen.queryByTestId('share-control')).toBeNull();
    expect(screen.queryByTestId('share-create')).toBeNull();
  });

  it('offers no light when the plan does not include it', async () => {
    setup(() => Promise.resolve(table({ access: { role: 'owner' } })));

    expect(await screen.findByTestId('share-control')).toBeTruthy();
    expect(screen.queryByTestId('light-control')).toBeNull();
  });
});
