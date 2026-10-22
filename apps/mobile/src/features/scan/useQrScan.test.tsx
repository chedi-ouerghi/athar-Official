import { describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react-native';
import { useQrScan } from './useQrScan';

const HOSTS = ['app.athar.example'];
const ID = 'k7q3x9m2d8r5t6w4';
const TOKEN = 'A'.repeat(43);
const PAIRING = `athar://pair?tableId=${ID}&token=${TOKEN}`;

function setup() {
  const onPairing = jest.fn<(link: { tableId: string; token: string }) => void>();
  const hook = renderHook(() => useQrScan({ allowedHosts: HOSTS, onPairing }));

  return { onPairing, ...hook };
}

describe('useQrScan', () => {
  it('hands a pairing QR code to onPairing', () => {
    const { result, onPairing } = setup();

    act(() => {
      result.current.onScanned(PAIRING);
    });

    expect(onPairing).toHaveBeenCalledWith({ tableId: ID, token: TOKEN });
  });

  it('hands over once, however many times the camera reports the same code', () => {
    const { result, onPairing } = setup();

    act(() => {
      for (let frame = 0; frame < 30; frame += 1) {
        result.current.onScanned(`https://app.athar.example/pair?tableId=${ID}&token=${TOKEN}`);
      }
    });

    expect(onPairing).toHaveBeenCalledTimes(1);
  });

  it('ignores a different code once one has been accepted', () => {
    const { result, onPairing } = setup();

    act(() => {
      result.current.onScanned(PAIRING);
      result.current.onScanned(`athar://pair?tableId=another-table&token=${'B'.repeat(43)}`);
    });

    expect(onPairing).toHaveBeenCalledTimes(1);
    expect(onPairing).toHaveBeenCalledWith({ tableId: ID, token: TOKEN });
  });

  it('opens nothing for a table link or a table id: that is only a name', () => {
    const { result, onPairing } = setup();

    act(() => {
      result.current.onScanned(`athar://t/${ID}`);
    });
    expect(result.current.unrecognised).toBe(true);

    act(() => {
      result.current.onScanned(`https://app.athar.example/t/${ID}`);
      result.current.onScanned(ID);
    });
    expect(result.current.unrecognised).toBe(true);
    expect(onPairing).not.toHaveBeenCalled();
  });

  it('shows a message for an unrecognised code and keeps scanning', () => {
    const { result, onPairing } = setup();

    act(() => {
      result.current.onScanned('https://example.com/not-a-table');
    });
    expect(result.current.unrecognised).toBe(true);
    expect(onPairing).not.toHaveBeenCalled();

    act(() => {
      result.current.onScanned(PAIRING);
    });
    expect(result.current.unrecognised).toBe(false);
    expect(onPairing).toHaveBeenCalledTimes(1);
  });

  it('refuses a pairing link from a host that is not allowed', () => {
    const { result, onPairing } = setup();

    act(() => {
      result.current.onScanned(`https://evil.example/pair?tableId=${ID}&token=${TOKEN}`);
    });

    expect(result.current.unrecognised).toBe(true);
    expect(onPairing).not.toHaveBeenCalled();
  });

  it('treats a pairing link with a malformed token as unrecognised', () => {
    const { result, onPairing } = setup();

    act(() => {
      result.current.onScanned(`athar://pair?tableId=${ID}&token=short`);
    });

    expect(result.current.unrecognised).toBe(true);
    expect(onPairing).not.toHaveBeenCalled();
  });

  it('accepts a code again after a reset, such as coming back to the screen', () => {
    const { result, onPairing } = setup();

    act(() => {
      result.current.onScanned(PAIRING);
    });
    act(() => {
      result.current.reset();
    });
    act(() => {
      result.current.onScanned(PAIRING);
    });

    expect(onPairing).toHaveBeenCalledTimes(2);
  });
});
