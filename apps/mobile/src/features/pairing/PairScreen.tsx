import { useEffect, useRef, type ReactElement } from 'react';
import { ApiError } from '../../api/http-client';
import { Button } from '../../components/Button';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { Screen } from '../../components/Screen';
import { useI18n } from '../../i18n/context';
import { usePairTable } from './usePairTable';

export interface PairScreenProps {
  readonly tableId: string;
  readonly token: string;
  /** The pairing worked; `tableId` is the one the server confirmed. */
  readonly onPaired: (tableId: string) => void;
  readonly onScanAnother: () => void;
  /**
   * Leave this account. Offered when the code was made for another account: trying
   * again cannot help, signing in with the right one can.
   */
  readonly onSignOut?: () => void | Promise<unknown>;
}

/**
 * Redeems a scanned or opened pairing link and then shows the table. The link is
 * read once, on arrival: a token is single-use for a claim, so it is never sent
 * again by a re-render, only by the user pressing "Try again".
 */
export function PairScreen({
  tableId,
  token,
  onPaired,
  onScanAnother,
  onSignOut,
}: PairScreenProps): ReactElement {
  const { t } = useI18n();
  const pair = usePairTable();
  const { run } = pair;
  const started = useRef(false);

  const redeem = async () => {
    const result = await run({ tableId, token });

    if (result !== undefined) {
      onPaired(result.tableId);
    }
  };

  useEffect(() => {
    if (!started.current) {
      started.current = true;
      void redeem();
    }
    // Once per arrival; later attempts come from the retry button.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (pair.state.status === 'error') {
    // The code is for another customer: it is not spent, but this account can never use it.
    const wrongAccount =
      pair.state.error instanceof ApiError && pair.state.error.code === 'PAIRING_WRONG_ACCOUNT';

    return (
      <Screen testID="pair-error-screen">
        <ErrorState
          error={pair.state.error}
          onRetry={wrongAccount ? undefined : redeem}
          testID="pair-error"
        />
        {wrongAccount && onSignOut !== undefined ? (
          <Button label={t('home.signOut')} onPress={onSignOut} testID="pair-sign-out" />
        ) : null}
        <Button
          label={t('table.scanAnother')}
          variant="ghost"
          onPress={onScanAnother}
          testID="pair-scan-another"
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false}>
      <LoadingState testID="pair-loading" />
    </Screen>
  );
}
