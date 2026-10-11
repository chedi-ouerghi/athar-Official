import { describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useQrScan } from './useQrScan';

const HOSTS = ['app.athar.example'];
const ID = 'k7q3x9m2d8r5t6w4';

function setup() {
  const onTable = jest.fn<(tableId: string) => void>();
  const hook = renderHook(() => useQrScan({ allowedHosts: HOSTS, onTable }));

  return { onTable, ...hook };
}

describe('useQrScan', () => {
  it('opens the table for a valid code', () => {
    const { result, onTable } = setup();

    act(() => {
      result.current.onScanned(`athar://t/${ID}`);
    });

    expect(onTable).toHaveBeenCalledTimes(1);
    expect(onTable).toHaveBeenCalledWith(ID);
  });

  it('navigates once, however many times the camera reports the same code', () => {
    const { result, onTable } = setup();

    act(() => {
      for (let frame = 0; frame < 30; frame += 1) {
        result.current.onScanned(`https://app.athar.example/t/${ID}`);
      }
    });

    expect(onTable).toHaveBeenCalledTimes(1);
  });

  it('ignores a different code once one has been accepted', () => {
    const { result, onTable } = setup();

    act(() => {
      result.current.onScanned(`athar://t/${ID}`);
      result.current.onScanned('athar://t/another-table');
    });

    expect(onTable).toHaveBeenCalledTimes(1);
  });

  it('shows a message for an unrecognised code and keeps scanning', () => {
    const { result, onTable } = setup();

    act(() => {
      result.current.onScanned('https://example.com/not-a-table');
    });
    expect(result.current.unrecognised).toBe(true);
    expect(onTable).not.toHaveBeenCalled();

    act(() => {
      result.current.onScanned(`athar://t/${ID}`);
    });
    expect(result.current.unrecognised).toBe(false);
    expect(onTable).toHaveBeenCalledWith(ID);
  });

  it('refuses a link from a host that is not allowed', () => {
    const { result, onTable } = setup();

    act(() => {
      result.current.onScanned(`https://evil.example/t/${ID}`);
    });

    expect(result.current.unrecognised).toBe(true);
    expect(onTable).not.toHaveBeenCalled();
  });

  it('accepts a code again after a reset, such as coming back to the screen', () => {
    const { result, onTable } = setup();

    act(() => {
      result.current.onScanned(`athar://t/${ID}`);
    });
    act(() => {
      result.current.reset();
    });
    act(() => {
      result.current.onScanned(`athar://t/${ID}`);
    });

    expect(onTable).toHaveBeenCalledTimes(2);
  });
});
