import { useCallback, useRef, useState } from 'react';
import { parsePairingQr, type PairingQr } from '../../linking/parse-pairing-qr';

export interface UseQrScan {
  /** Give it every code the camera reads. */
  readonly onScanned: (data: string) => void;
  /** The last code was not an ATHAR pairing code. Cleared by the next good code or `reset`. */
  readonly unrecognised: boolean;
  /** Start accepting codes again, e.g. when the screen comes back into view. */
  readonly reset: () => void;
}

/**
 * The decision behind the scanner.
 *
 * Only a pairing link (the QR code made for one table and one customer) is ever
 * accepted. A table link, a bare table id or any other QR code is only a message:
 * "that is not your table's code", and scanning goes on.
 *
 * The camera reports the same code many times a second. The first valid one hands
 * over and every later one is ignored, so the screen cannot pair twice, and a spent
 * code is not sent to the server again by a stray frame.
 */
export function useQrScan(options: {
  readonly allowedHosts: readonly string[];
  /** A pairing QR code (a claim or an invitation) was read. */
  readonly onPairing: (link: PairingQr) => void;
}): UseQrScan {
  const { allowedHosts, onPairing } = options;
  const handled = useRef(false);
  const [unrecognised, setUnrecognised] = useState(false);

  const onScanned = useCallback(
    (data: string) => {
      if (handled.current) {
        return;
      }

      const pairing = parsePairingQr(data, { allowedHosts });

      if (pairing === null) {
        setUnrecognised(true);
        return;
      }

      // Set before navigating: the next frame can arrive before the screen leaves.
      handled.current = true;
      setUnrecognised(false);
      onPairing(pairing);
    },
    [allowedHosts, onPairing],
  );

  const reset = useCallback(() => {
    handled.current = false;
    setUnrecognised(false);
  }, []);

  return { onScanned, unrecognised, reset };
}
