import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { HealthResponse } from '@athar/contracts';
import { AtharApiClient, probeBackend } from '../api/athar-api-client';
import { resolveLoopbackHost } from '../config/env';
import { environment } from '../config/environment';
import { darkTheme, lightTheme, spacing, type Theme } from '../theme';

/** Lifecycle of the single backend connectivity check. */
type ProbeState =
  | { readonly status: 'checking' }
  | { readonly status: 'reachable'; readonly health: HealthResponse }
  | { readonly status: 'unreachable'; readonly reason: string };

/**
 * Startup screen.
 *
 * Its purpose is to prove the foundation works: the app boots, reads its
 * configuration, and can talk to the API. It deliberately shows no product
 * content — the product surface is not implemented yet.
 *
 * The screen renders and stays fully usable when the backend is unreachable;
 * connectivity is reported as data, never treated as a fatal error.
 */
export default function StartupScreen() {
  const colorScheme = useColorScheme();
  const theme = useMemo(() => (colorScheme === 'dark' ? darkTheme : lightTheme), [colorScheme]);

  const apiClient = useMemo(() => new AtharApiClient(environment), []);
  const [probe, setProbe] = useState<ProbeState>({ status: 'checking' });

  // Keeps the in-flight probe from resolving into an unmounted component.
  const inFlight = useRef<AbortController | null>(null);

  /**
   * Run a probe and publish its result.
   *
   * State is only written from the promise callback, never synchronously, so
   * mounting the screen cannot trigger a cascading render.
   */
  const performProbe = useCallback(
    (controller: AbortController) => {
      void probeBackend(apiClient).then((result) => {
        if (controller.signal.aborted) {
          return;
        }

        setProbe(
          result.state === 'reachable'
            ? { status: 'reachable', health: result.health }
            : { status: 'unreachable', reason: result.reason },
        );
      });
    },
    [apiClient],
  );

  /** User-triggered re-check. */
  const runProbe = useCallback(() => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    setProbe({ status: 'checking' });
    performProbe(controller);
  }, [performProbe]);

  useEffect(() => {
    const controller = new AbortController();
    inFlight.current = controller;
    performProbe(controller);

    return () => {
      controller.abort();
    };
  }, [performProbe]);

  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>ATHAR</Text>
          <Text style={styles.subtitle}>Mobile foundation</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Configuration</Text>

          <DetailRow label="API base URL" value={environment.apiBaseUrl} styles={styles} />
          <DetailRow
            label="Resolved from"
            value={
              environment.apiBaseUrlSource === 'configured'
                ? 'EXPO_PUBLIC_API_BASE_URL'
                : `Platform default (${resolveLoopbackHost(Platform.OS)})`
            }
            styles={styles}
          />
          <DetailRow
            label="Request timeout"
            value={`${environment.apiTimeoutMs} ms`}
            styles={styles}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Backend</Text>

          {probe.status === 'checking' ? (
            <View style={styles.row}>
              <ActivityIndicator color={theme.accent} />
              <Text style={styles.rowValue}>Checking {environment.apiBaseUrl}…</Text>
            </View>
          ) : null}

          {probe.status === 'reachable' ? (
            <>
              <StatusLine
                label="Health endpoint"
                value="Reachable"
                tone="success"
                styles={styles}
              />
              <DetailRow label="Service" value={probe.health.service} styles={styles} />
              <DetailRow label="Version" value={probe.health.version} styles={styles} />
              <DetailRow label="Uptime" value={`${probe.health.uptimeSeconds} s`} styles={styles} />
            </>
          ) : null}

          {probe.status === 'unreachable' ? (
            <>
              <StatusLine
                label="Health endpoint"
                value="Unreachable"
                tone="danger"
                styles={styles}
              />
              <Text style={styles.reason}>{probe.reason}</Text>
              <Text style={styles.hint}>
                The app starts and remains usable while the API is offline.
              </Text>
            </>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Re-check backend connectivity"
            onPress={runProbe}
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          >
            <Text style={styles.buttonLabel}>Re-check</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

type Styles = ReturnType<typeof createStyles>;

interface RowProps {
  readonly label: string;
  readonly value: string;
  readonly styles: Styles;
}

/** A label/value pair used for environment and health metadata. */
function DetailRow({ label, value, styles }: RowProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

interface StatusLineProps extends RowProps {
  readonly tone: 'success' | 'danger';
}

/** A label/value pair whose value is colour-coded by outcome. */
function StatusLine({ label, value, tone, styles }: StatusLineProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[styles.rowValue, tone === 'success' ? styles.statusSuccess : styles.statusDanger]}
      >
        {value}
      </Text>
    </View>
  );
}

function createStyles(theme: Theme) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.background,
    },
    container: {
      padding: spacing.lg,
      gap: spacing.md,
    },
    header: {
      paddingVertical: spacing.md,
    },
    title: {
      color: theme.text,
      fontSize: 32,
      fontWeight: '700',
      letterSpacing: 2,
    },
    subtitle: {
      color: theme.textMuted,
      fontSize: 15,
      marginTop: spacing.xs,
    },
    card: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: 12,
      borderWidth: 1,
      padding: spacing.md,
      gap: spacing.sm,
    },
    cardTitle: {
      color: theme.textMuted,
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    rowLabel: {
      color: theme.textMuted,
      fontSize: 14,
      flexShrink: 0,
    },
    rowValue: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '500',
      flexShrink: 1,
      textAlign: 'right',
    },
    statusSuccess: {
      color: theme.success,
    },
    statusDanger: {
      color: theme.danger,
    },
    reason: {
      color: theme.textMuted,
      fontSize: 13,
      lineHeight: 19,
    },
    hint: {
      color: theme.textMuted,
      fontSize: 13,
      fontStyle: 'italic',
    },
    button: {
      alignItems: 'center',
      backgroundColor: theme.accent,
      borderRadius: 8,
      marginTop: spacing.sm,
      paddingVertical: spacing.sm + 2,
    },
    buttonPressed: {
      opacity: 0.7,
    },
    buttonLabel: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '600',
    },
  });
}
