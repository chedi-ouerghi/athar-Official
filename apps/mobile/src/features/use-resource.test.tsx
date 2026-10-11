import { describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { DesignDetail, ListDesignsResponse, Table } from '@athar/contracts';
import { ApiError } from '../api/http-client';
import { appWrapper, stubClient } from '../test-utils';
import { FOUR_DESIGNS, TABLE_ID, networkError, table } from '../test-fixtures';
import { useDesign } from './designs/useDesign';
import { useDesigns } from './designs/useDesigns';
import { useTable } from './tables/useTable';

describe('useTable', () => {
  it('loads the table, passing the id and an abort signal', async () => {
    const getTable = jest.fn<(id: string, signal?: AbortSignal) => Promise<Table>>();
    getTable.mockResolvedValue(table());
    const { result } = renderHook(() => useTable(TABLE_ID), {
      wrapper: appWrapper(stubClient({ getTable: getTable as never })),
    });

    expect(result.current.state).toStrictEqual({ status: 'loading' });
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });

    expect(getTable).toHaveBeenCalledWith(TABLE_ID, expect.any(AbortSignal));
  });

  it('reports a failure, and loads again on reload', async () => {
    const getTable = jest
      .fn<(id: string, signal?: AbortSignal) => Promise<Table>>()
      .mockRejectedValueOnce(networkError())
      .mockResolvedValue(table());
    const { result } = renderHook(() => useTable(TABLE_ID), {
      wrapper: appWrapper(stubClient({ getTable: getTable as never })),
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('error');
    });

    act(() => {
      result.current.reload();
    });
    expect(result.current.state.status).toBe('loading');
    await waitFor(() => {
      expect(result.current.state.status).toBe('ready');
    });
  });

  it('aborts the request when the screen goes away', async () => {
    let signal: AbortSignal | undefined;
    const getTable = jest
      .fn<(id: string, signal?: AbortSignal) => Promise<Table>>()
      .mockImplementation((_id, given) => {
        signal = given;
        return new Promise<Table>(() => undefined);
      });
    const { unmount } = renderHook(() => useTable(TABLE_ID), {
      wrapper: appWrapper(stubClient({ getTable: getTable as never })),
    });

    await waitFor(() => {
      expect(signal).toBeDefined();
    });
    expect(signal?.aborted).toBe(false);

    unmount();

    expect(signal?.aborted).toBe(true);
  });

  it('does not report the cancellation it caused as an error', async () => {
    const getTable = jest
      .fn<(id: string, signal?: AbortSignal) => Promise<Table>>()
      .mockImplementation(
        (_id, signal) =>
          new Promise<Table>((_resolve, reject) => {
            signal?.addEventListener('abort', () => {
              reject(new ApiError('cancelled', 'cancelled'));
            });
          }),
      );
    const { result, rerender } = renderHook(({ id }: { id: string }) => useTable(id), {
      wrapper: appWrapper(stubClient({ getTable: getTable as never })),
      initialProps: { id: 'first-table' },
    });

    // Switching to another table cancels the first request.
    rerender({ id: 'second-table' });
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.state.status).toBe('loading');
  });

  it('ignores a late answer for a table the screen has moved away from', async () => {
    const resolvers: Record<string, (value: Table) => void> = {};
    const getTable = jest
      .fn<(id: string, signal?: AbortSignal) => Promise<Table>>()
      .mockImplementation(
        (id) =>
          new Promise<Table>((resolve) => {
            resolvers[id] = resolve;
          }),
      );
    const { result, rerender } = renderHook(({ id }: { id: string }) => useTable(id), {
      wrapper: appWrapper(stubClient({ getTable: getTable as never })),
      initialProps: { id: 'first-table' },
    });

    rerender({ id: 'second-table' });
    await act(async () => {
      resolvers['first-table']?.(table({ displayName: 'Old' }));
      await Promise.resolve();
    });

    expect(result.current.state.status).toBe('loading');

    await act(async () => {
      resolvers['second-table']?.(table({ displayName: 'New' }));
      await Promise.resolve();
    });

    expect(result.current.state).toMatchObject({ status: 'ready', data: { displayName: 'New' } });
  });
});

describe('useDesigns and useDesign', () => {
  it('load the collection and one design', async () => {
    const listDesigns = jest.fn<() => Promise<ListDesignsResponse>>().mockResolvedValue({
      collectionVersion: 1,
      designs: FOUR_DESIGNS,
    });
    const getDesign = jest
      .fn<(id: string) => Promise<DesignDetail>>()
      .mockResolvedValue(FOUR_DESIGNS[0] as DesignDetail);
    const wrapper = appWrapper(
      stubClient({ listDesigns: listDesigns as never, getDesign: getDesign as never }),
    );

    const designs = renderHook(() => useDesigns(), { wrapper });
    const one = renderHook(() => useDesign('dunes'), { wrapper });

    await waitFor(() => {
      expect(designs.result.current.state.status).toBe('ready');
      expect(one.result.current.state.status).toBe('ready');
    });

    expect(designs.result.current.state).toMatchObject({
      data: { designs: [{ id: 'dunes' }, { id: 'khoos' }, { id: 'sadu' }, { id: 'star' }] },
    });
    expect(getDesign).toHaveBeenCalledWith('dunes', expect.any(AbortSignal));
  });
});
