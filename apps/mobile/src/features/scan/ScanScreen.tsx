import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactElement } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { EnterCodeForm } from '../../components/EnterCodeForm';
import { LoadingState } from '../../components/LoadingState';
import { NoticeCard } from '../../components/NoticeCard';
import { Screen } from '../../components/Screen';
import { useI18n } from '../../i18n/context';
import { radius, spacing } from '../../theme';
import { classifyScanView } from './scan-permission';
import { useQrScan } from './useQrScan';

export interface ScanScreenProps {
  readonly allowedHosts: readonly string[];
  readonly onTable: (tableId: string) => void;
}

/** The in-app QR scanner, with the typed code as the way out when the camera is unavailable. */
export function ScanScreen({ allowedHosts, onTable }: ScanScreenProps): ReactElement {
  const { t } = useI18n();
  const [permission, requestPermission] = useCameraPermissions();
  const [typing, setTyping] = useState(false);
  const scan = useQrScan({ allowedHosts, onTable });
  const { reset } = scan;

  // Coming back to this screen (from the table, say) must scan again.
  useFocusEffect(
    useCallback(() => {
      reset();
    }, [reset]),
  );

  const view = classifyScanView(permission);

  if (view === 'checking') {
    return (
      <Screen scroll={false}>
        <LoadingState testID="scan-checking" />
      </Screen>
    );
  }

  if (view === 'ask') {
    return (
      <Screen>
        <NoticeCard
          title={t('scan.permission.title')}
          body={t('scan.permission.explain')}
          testID="scan-ask"
        >
          <Button
            label={t('scan.permission.allow')}
            onPress={async () => {
              await requestPermission();
            }}
            testID="scan-allow"
          />
        </NoticeCard>
        <EnterInstead allowedHosts={allowedHosts} onTable={onTable} />
      </Screen>
    );
  }

  if (view === 'denied') {
    return (
      <Screen>
        <NoticeCard
          tone="warning"
          title={t('scan.permission.title')}
          body={t('scan.permission.denied')}
          testID="scan-denied"
        >
          {permission?.canAskAgain ? (
            <Button
              label={t('scan.permission.allow')}
              variant="secondary"
              onPress={async () => {
                await requestPermission();
              }}
              testID="scan-allow-again"
            />
          ) : (
            <Button
              label={t('scan.permission.settings')}
              variant="secondary"
              onPress={async () => {
                await Linking.openSettings().catch(() => undefined);
              }}
              testID="scan-settings"
            />
          )}
        </NoticeCard>
        <EnterCodeForm allowedHosts={allowedHosts} onTable={onTable} />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} contentStyle={styles.scanContent}>
      <AppText variant="title">{t('scan.title')}</AppText>
      <View style={styles.cameraFrame}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => {
            scan.onScanned(data);
          }}
          testID="scan-camera"
        />
      </View>
      {scan.unrecognised ? (
        <AppText tone="danger" accessibilityRole="alert" testID="scan-unrecognised">
          {t('scan.unrecognised')}
        </AppText>
      ) : (
        <AppText tone="textMuted">{t('scan.hint')}</AppText>
      )}
      {typing ? (
        <EnterCodeForm allowedHosts={allowedHosts} onTable={onTable} autoFocus />
      ) : (
        <Button
          label={t('scan.enterInstead')}
          variant="ghost"
          onPress={() => {
            setTyping(true);
          }}
          testID="scan-enter-instead"
        />
      )}
    </Screen>
  );
}

function EnterInstead({
  allowedHosts,
  onTable,
}: {
  readonly allowedHosts: readonly string[];
  readonly onTable: (tableId: string) => void;
}): ReactElement {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return open ? (
    <EnterCodeForm allowedHosts={allowedHosts} onTable={onTable} autoFocus />
  ) : (
    <Button
      label={t('scan.enterInstead')}
      variant="ghost"
      onPress={() => {
        setOpen(true);
      }}
      testID="scan-enter-instead"
    />
  );
}

const styles = StyleSheet.create({
  scanContent: { gap: spacing.md },
  cameraFrame: {
    flex: 1,
    minHeight: 280,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
});
