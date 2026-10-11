import { useCallback, useRef, useState } from 'react';
import { parseTableLink } from '../../linking/parse-table-link';

export interface UseQrScan {
  /** Give it every code the camera reads. */
  readonly onScanned: (data: string) => void;
  /** The last code was not an ATHAR table. Cleared by the next good code or `reset`. */
  readonly unrecognised: boolean;
  /** Start accepting codes again, e.g. when the screen comes back into view. */
  readonly reset: () => void;
}

/**
 * The decision behind the scanner.
 *
 * The camera reports the same code many times a second. The first valid one
 * navigates and every later one is ignored, so the screen cannot open the table
 * twice. An unrecognised code only sets a message; scanning goes on.
 */
export function useQrScan(options: {
  readonly allowedHosts: readonly string[];
  readonly onTable: (tableId: string) => void;
}): UseQrScan {
  const { allowedHosts, onTable } = options;
  const handled = useRef(false);
  const [unrecognised, setUnrecognised] = useState(false);

  const onScanned = useCallback(
    (data: string) => {
      if (handled.current) {
        return;
      }

      const parsed = parseTableLink(data, { allowedHosts });

      if (parsed.tableId === undefined) {
        setUnrecognised(true);
        return;
      }

      // Set before navigating: the next frame can arrive before the screen leaves.
      handled.current = true;
      setUnrecognised(false);
      onTable(parsed.tableId);
    },
    [allowedHosts, onTable],
  );

  const reset = useCallback(() => {
    handled.current = false;
    setUnrecognised(false);
  }, []);

  return { onScanned, unrecognised, reset };
}
