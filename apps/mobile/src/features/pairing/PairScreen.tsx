import { useEffect, useRef, type ReactElement } from 'react';
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
    return (
      <Screen testID="pair-error-screen">
        <ErrorState error={pair.state.error} onRetry={redeem} testID="pair-error" />
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
