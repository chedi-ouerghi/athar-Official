import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { Animated, Easing, Linking, StyleSheet, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { EnterCodeForm } from '../../components/EnterCodeForm';
import { FadeIn } from '../../components/FadeIn';
import { LoadingState } from '../../components/LoadingState';
import { NoticeCard } from '../../components/NoticeCard';
import { Screen } from '../../components/Screen';
import { useReduceMotion } from '../../components/use-reduce-motion';
import { useTheme } from '../../components/use-theme';
import { useI18n } from '../../i18n/context';
import type { PairingQr } from '../../linking/parse-pairing-qr';
import { radius, shadows, spacing } from '../../theme';
import { classifyScanView } from './scan-permission';
import { useQrScan } from './useQrScan';

export interface ScanScreenProps {
  readonly allowedHosts: readonly string[];
  /** The QR code made for the customer's table was read. */
  readonly onPairing: (link: PairingQr) => void;
}

/** Side of the square the code should sit in, and the length of the corner marks. */
const FINDER = 232;
const CORNER = 34;

/**
 * The in-app QR scanner. It reads one thing, the pairing code made for one table and
 * one customer; the pasted link is the way out when the camera is unavailable.
 */
export function ScanScreen({ allowedHosts, onPairing }: ScanScreenProps): ReactElement {
  const { t } = useI18n();
  const [permission, requestPermission] = useCameraPermissions();
  const [typing, setTyping] = useState(false);
  const [focused, setFocused] = useState(true);
  const scan = useQrScan({ allowedHosts, onPairing });
  const { reset } = scan;

  // Coming back to this screen (from the table, say) must scan again, and the camera
  // runs only while this tab is the one in front: a hidden tab must not hold it open.
  useFocusEffect(
    useCallback(() => {
      reset();
      setFocused(true);

      return () => {
        setFocused(false);
      };
    }, [reset]),
  );

  const view = classifyScanView(permission);

  if (view === 'checking') {
    return (
      <Screen scroll={false} tabBar>
        <LoadingState testID="scan-checking" />
      </Screen>
    );
  }

  if (view === 'ask') {
    return (
      <Screen tabBar>
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
        <EnterInstead allowedHosts={allowedHosts} onPairing={onPairing} />
      </Screen>
    );
  }

  if (view === 'denied') {
    return (
      <Screen tabBar>
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
        <EnterCodeForm allowedHosts={allowedHosts} onPairing={onPairing} />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} tabBar glow={false} contentStyle={styles.scanContent}>
      <FadeIn>
        <AppText variant="title" accessibilityRole="header">
          {t('scan.title')}
        </AppText>
      </FadeIn>

      <CameraFrame>
        {focused ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => {
              scan.onScanned(data);
            }}
            testID="scan-camera"
          />
        ) : null}
        <Viewfinder />
      </CameraFrame>

      {scan.unrecognised ? (
        <AppText tone="danger" accessibilityRole="alert" testID="scan-unrecognised">
          {t('scan.unrecognised')}
        </AppText>
      ) : (
        <AppText tone="textMuted">{t('scan.hint')}</AppText>
      )}
      {typing ? (
        <EnterCodeForm allowedHosts={allowedHosts} onPairing={onPairing} autoFocus />
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

/** The rounded window the camera shows through, edged in gold. */
function CameraFrame({ children }: { readonly children: ReactNode }): ReactElement {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.cameraFrame,
        shadows.glow,
        { backgroundColor: theme.surface, borderColor: theme.gold, shadowColor: theme.glow },
      ]}
    >
      {children}
    </View>
  );
}

/** Four gold corners and a line that sweeps down the square, over the live picture. */
function Viewfinder(): ReactElement {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const [sweep] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reduceMotion) {
      return undefined;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sweep, {
          toValue: 1,
          duration: 1900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(sweep, {
          toValue: 0,
          duration: 1900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();

    return () => {
      loop.stop();
    };
  }, [reduceMotion, sweep]);

  const corner = { borderColor: theme.gold };

  return (
    <View style={[StyleSheet.absoluteFill, styles.finderWrap]} pointerEvents="none">
      <View style={styles.finder}>
        <View style={[styles.corner, styles.topLeft, corner]} />
        <View style={[styles.corner, styles.topRight, corner]} />
        <View style={[styles.corner, styles.bottomLeft, corner]} />
        <View style={[styles.corner, styles.bottomRight, corner]} />
        {reduceMotion ? null : (
          <Animated.View
            style={[
              styles.line,
              {
                backgroundColor: theme.gold,
                shadowColor: theme.glow,
                transform: [
                  {
                    translateY: sweep.interpolate({
                      inputRange: [0, 1],
                      outputRange: [CORNER / 2, FINDER - CORNER / 2],
                    }),
                  },
                ],
              },
            ]}
          />
        )}
      </View>
    </View>
  );
}

function EnterInstead({
  allowedHosts,
  onPairing,
}: {
  readonly allowedHosts: readonly string[];
  readonly onPairing: ScanScreenProps['onPairing'];
}): ReactElement {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  return open ? (
    <EnterCodeForm allowedHosts={allowedHosts} onPairing={onPairing} autoFocus />
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
    minHeight: 300,
    borderRadius: radius.xl,
    borderWidth: 1.5,
    overflow: 'hidden',
  },
  finderWrap: { alignItems: 'center', justifyContent: 'center' },
  finder: { width: FINDER, height: FINDER },
  corner: { position: 'absolute', width: CORNER, height: CORNER },
  topLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 16 },
  topRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 16 },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 16,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 16,
  },
  line: {
    position: 'absolute',
    top: 0,
    left: CORNER / 2,
    right: CORNER / 2,
    height: 3,
    borderRadius: 2,
    shadowOpacity: 0.9,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
});
