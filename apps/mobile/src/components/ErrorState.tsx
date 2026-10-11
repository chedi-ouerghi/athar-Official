import type { ReactElement } from 'react';
import { errorMessageKey } from '../api/error-messages';
import { useI18n } from '../i18n/context';
import { Button } from './Button';
import { NoticeCard } from './NoticeCard';

export interface ErrorStateProps {
  /** Whatever was thrown. Mapped to a message the user can read; never shown raw. */
  readonly error: unknown;
  /** Shows a "Try again" button when given. */
  readonly onRetry?: () => void | Promise<unknown>;
  readonly testID?: string;
}

export function ErrorState({ error, onRetry, testID }: ErrorStateProps): ReactElement {
  const { t } = useI18n();

  return (
    <NoticeCard
      tone="danger"
      alert
      title={t('errorState.title')}
      body={t(errorMessageKey(error))}
      testID={testID}
    >
      {onRetry ? (
        <Button
          label={t('common.retry')}
          onPress={onRetry}
          testID={testID ? `${testID}-retry` : undefined}
        />
      ) : null}
    </NoticeCard>
  );
}
