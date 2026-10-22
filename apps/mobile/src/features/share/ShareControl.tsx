import type { CreateShareResponse } from '@athar/contracts';
import { useState, type ReactElement } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { errorMessageKey } from '../../api/error-messages';
import { useApiClient } from '../../api/api-client-context';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { useI18n } from '../../i18n/context';
import { spacing } from '../../theme';
import { useAction } from '../use-action';

/**
 * Owner only: creates an invitation (one guest, 24 hours, the contract defaults)
 * and opens the system share sheet with its link. The link is shown by the API
 * once, so it is kept here to send again.
 */
export function ShareControl({ tableId }: { readonly tableId: string }): ReactElement {
  const { t } = useI18n();
  const client = useApiClient();
  const [created, setCreated] = useState<CreateShareResponse | undefined>(undefined);
  const create = useAction(() => client.createShare(tableId));

  const send = async (link: string) => {
    // A dismissed share sheet is not an error.
    await Share.share({ message: t('share.message', { link }) }).catch(() => undefined);
  };

  const press = async () => {
    if (created !== undefined) {
      await send(created.link);
      return;
    }

    const share = await create.run();

    if (share !== undefined) {
      setCreated(share);
      await send(share.link);
    }
  };

  return (
    <View style={styles.container} testID="share-control">
      <AppText variant="heading">{t('share.title')}</AppText>
      <AppText tone="textMuted">{t('share.body')}</AppText>
      <Button
        label={created !== undefined ? t('share.send') : t('share.create')}
        variant="secondary"
        onPress={press}
        testID="share-create"
      />
      {create.state.status === 'error' ? (
        <AppText tone="danger" accessibilityRole="alert" testID="share-error">
          {`${t('share.failed')}. ${t(errorMessageKey(create.state.error))}`}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm, marginTop: spacing.md },
});
