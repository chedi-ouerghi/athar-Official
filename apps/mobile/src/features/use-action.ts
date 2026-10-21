import { useCallback, useEffect, useRef, useState } from 'react';

export type ActionState =
  | { readonly status: 'idle' }
  | { readonly status: 'working' }
  | { readonly status: 'error'; readonly error: unknown };

export interface Action<Args extends unknown[], Result> {
  readonly state: ActionState;
  /** Resolves with the result, or `undefined` if it failed (see `state`) or one is already under way. */
  readonly run: (...args: Args) => Promise<Result | undefined>;
}

/**
 * One user-triggered call (a write) with its loading and error state, the same
 * shape `useStartJob` has: a second press while one is under way is ignored.
 */
export function useAction<Args extends unknown[], Result>(
  call: (...args: Args) => Promise<Result>,
): Action<Args, Result> {
  const [state, setState] = useState<ActionState>({ status: 'idle' });
  const inFlight = useRef(false);
  const latest = useRef(call);

  useEffect(() => {
    latest.current = call;
  });

  const run = useCallback(async (...args: Args): Promise<Result | undefined> => {
    if (inFlight.current) {
      return undefined;
    }

    inFlight.current = true;
    setState({ status: 'working' });

    try {
      const result = await latest.current(...args);

      setState({ status: 'idle' });
      return result;
    } catch (error) {
      setState({ status: 'error', error });
      return undefined;
    } finally {
      inFlight.current = false;
    }
  }, []);

  return { state, run };
}
