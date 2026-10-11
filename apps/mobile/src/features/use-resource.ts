/**
 * Loading one thing from the API for a screen.
 *
 * The request is aborted when the screen goes away or the inputs change, so a
 * slow answer can never land in a screen that has moved on. There is no cache:
 * one polling hook and a few one-shot reads cover this milestone (decision 12).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../api/http-client';

export type ResourceState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: T }
  | { readonly status: 'error'; readonly error: unknown };

export interface Resource<T> {
  readonly state: ResourceState<T>;
  /** Load again, showing the loading state. */
  readonly reload: () => void;
  /** Load again in the background: what is shown stays until the new answer arrives. */
  readonly refresh: () => void;
}

/**
 * @param load Reads the resource. It must honour the signal it is given. It is
 *   re-run whenever `dependencies` change, so pass everything it closes over.
 */
export function useResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  dependencies: readonly unknown[],
): Resource<T> {
  const [state, setState] = useState<ResourceState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const quiet = useRef(false);

  useEffect(() => {
    const controller = new AbortController();

    if (!quiet.current) {
      setState({ status: 'loading' });
    }
    quiet.current = false;

    load(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) {
          setState({ status: 'ready', data });
        }
      },
      (error: unknown) => {
        // A cancelled call is the screen leaving, not a failure to report.
        if (
          controller.signal.aborted ||
          (error instanceof ApiError && error.kind === 'cancelled')
        ) {
          return;
        }

        setState({ status: 'error', error });
      },
    );

    return () => {
      controller.abort();
    };
    // `load` is deliberately not a dependency: callers pass a fresh closure each
    // render, and `dependencies` says what actually matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, attempt]);

  const reload = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  const refresh = useCallback(() => {
    quiet.current = true;
    setAttempt((value) => value + 1);
  }, []);

  return { state, reload, refresh };
}
