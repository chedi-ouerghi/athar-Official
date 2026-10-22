import type { Table, TableGeometry } from '@athar/contracts';
import { useEffect, useRef, useState, type ReactElement } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Card } from '../../components/Card';
import { DesignCard } from '../../components/DesignCard';
import { DotRule } from '../../components/DotRule';
import { ErrorState } from '../../components/ErrorState';
import { Eyebrow } from '../../components/Eyebrow';
import { FadeIn, staggerDelay } from '../../components/FadeIn';
import { LoadingState } from '../../components/LoadingState';
import { NoticeCard } from '../../components/NoticeCard';
import { Screen } from '../../components/Screen';
import { useReduceMotion } from '../../components/use-reduce-motion';
import { useTheme } from '../../components/use-theme';
import { useI18n } from '../../i18n/context';
import { radius, spacing } from '../../theme';
import { useDesigns } from '../designs/useDesigns';
import { storeRecentTable } from '../home/recent-table';
import { LightControl } from '../light/LightControl';
import { CONNECTION_LABEL_KEY, capabilitiesOf, classifyTableView } from './table-view';
import { useTable } from './useTable';

export interface TableScreenProps {
  readonly tableId: string;
  readonly onOpenDesign: (designId: string) => void;
  readonly onWatchJob: (jobId: string) => void;
  /** Leave for the scanner, from a table that does not exist. */
  readonly onScanAnother: () => void;
  /**
   * Whether the screen is in front of the user (the route passes its focus). When
   * it turns true again the table is read again, in the background: coming back
   * from a drawing must not show the status from before it.
   */
  readonly active?: boolean;
}

/** The table's own page: who it is, what state it is in, and the designs to choose from. */
export function TableScreen({
  tableId,
  onOpenDesign,
  onWatchJob,
  onScanAnother,
  active = true,
}: TableScreenProps): ReactElement {
  const { t } = useI18n();
  const table = useTable(tableId);

  const wasActive = useRef(active);
  const refreshTable = table.refresh;

  useEffect(() => {
    if (active && !wasActive.current) {
      refreshTable();
    }

    wasActive.current = active;
  }, [active, refreshTable]);

  // Remember the table once it is known to exist, so the home screen can offer it again.
  const knownId = table.state.status === 'ready' ? table.state.data.id : undefined;
  const knownName = table.state.status === 'ready' ? table.state.data.displayName : undefined;

  useEffect(() => {
    if (knownId !== undefined && knownName !== undefined) {
      storeRecentTable({ id: knownId, name: knownName });
    }
  }, [knownId, knownName]);

  const view = classifyTableView(table.state);

  if (view === 'loading') {
    return (
      <Screen scroll={false}>
        <LoadingState testID="table-loading" />
      </Screen>
    );
  }

  if (view === 'unknown') {
    return (
      <Screen>
        <NoticeCard
          title={t('table.unknown.title')}
          body={t('error.tableNotFound')}
          testID="table-unknown"
        >
          <Button
            label={t('table.scanAnother')}
            onPress={onScanAnother}
            testID="table-scan-another"
          />
        </NoticeCard>
      </Screen>
    );
  }

  if (view === 'error' || table.state.status !== 'ready') {
    return (
      <Screen>
        <ErrorState
          error={table.state.status === 'error' ? table.state.error : undefined}
          onRetry={table.reload}
          testID="table-error"
        />
      </Screen>
    );
  }

  const data = table.state.data;
  const capabilities = capabilitiesOf(data);

  return (
    <Screen testID="table-screen">
      <TableHeader table={data} />

      {view === 'disabled' ? (
        <NoticeCard
          tone="warning"
          title={t('table.disabled.title')}
          body={t('table.disabled.body')}
          testID="table-disabled"
        />
      ) : null}

      {view === 'offline' ? (
        <NoticeCard
          tone="warning"
          title={t('table.offline.title')}
          body={t('table.offline.body')}
          testID="table-offline"
        >
          <Button label={t('common.retry')} onPress={table.reload} testID="table-offline-retry" />
        </NoticeCard>
      ) : null}

      {view === 'busy' ? (
        <NoticeCard
          tone="warning"
          title={t('table.busy.title')}
          body={t('table.busy.body')}
          testID="table-busy"
        >
          {data.activeJobId !== null ? (
            <WatchButton jobId={data.activeJobId} onWatchJob={onWatchJob} />
          ) : (
            <Button label={t('common.retry')} onPress={table.reload} testID="table-busy-retry" />
          )}
        </NoticeCard>
      ) : null}

      {capabilities.light && view !== 'disabled' ? (
        <FadeIn delay={staggerDelay(1)}>
          <LightControl tableId={data.id} />
        </FadeIn>
      ) : null}

      {view === 'ready' ? (
        <DesignList geometry={data.geometry} onOpenDesign={onOpenDesign} />
      ) : null}
    </Screen>
  );
}

function WatchButton({
  jobId,
  onWatchJob,
}: {
  readonly jobId: string;
  readonly onWatchJob: (jobId: string) => void;
}): ReactElement {
  const { t } = useI18n();

  return (
    <Button
      label={t('table.watch')}
      icon="play"
      onPress={() => {
        onWatchJob(jobId);
      }}
      testID="table-watch"
    />
  );
}

/** A dot that breathes while the table is ready, so "live" looks live. */
function StatusDot({ live }: { readonly live: boolean }): ReactElement {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!live || reduceMotion) {
      pulse.setValue(0);
      return undefined;
    }

    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1600,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();

    return () => {
      loop.stop();
    };
  }, [live, pulse, reduceMotion]);

  const colour = live ? theme.success : theme.warning;

  return (
    <View style={styles.dotBox}>
      {live ? (
        <Animated.View
          style={[
            styles.halo,
            {
              backgroundColor: colour,
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
              transform: [
                { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) },
              ],
            },
          ]}
        />
      ) : null}
      <View style={[styles.dot, { backgroundColor: colour }]} />
    </View>
  );
}

function TableHeader({ table }: { readonly table: Table }): ReactElement {
  const { t } = useI18n();
  const theme = useTheme();
  const live = table.enabled && table.connection === 'online';

  return (
    <FadeIn>
      <Card tone="glow" style={styles.header}>
        <View style={styles.headerTop}>
          <View
            style={[
              styles.status,
              { backgroundColor: theme.surfaceMuted, borderColor: theme.border },
            ]}
          >
            <StatusDot live={live} />
            <AppText variant="label" tone="accentText" testID="table-connection">
              {`${t('table.status')}: ${t(table.enabled ? CONNECTION_LABEL_KEY[table.connection] : 'table.connection.disabled')}`}
            </AppText>
          </View>
        </View>

        <AppText variant="display" numberOfLines={2}>
          {table.displayName}
        </AppText>
        <AppText tone="textMuted">{table.location}</AppText>
        <DotRule />
      </Card>
    </FadeIn>
  );
}

function DesignList({
  geometry,
  onOpenDesign,
}: {
  readonly geometry: TableGeometry;
  readonly onOpenDesign: (designId: string) => void;
}): ReactElement {
  const { t } = useI18n();
  const designs = useDesigns();

  return (
    <View style={styles.designs}>
      <View style={styles.sectionHeading}>
        <AppText variant="heading" style={styles.sectionTitle}>
          {t('table.designsTitle')}
        </AppText>
        {designs.state.status === 'ready' ? (
          <Eyebrow>
            {t('table.designsCount', { count: String(designs.state.data.designs.length) })}
          </Eyebrow>
        ) : null}
      </View>

      {designs.state.status === 'loading' ? <LoadingState testID="designs-loading" /> : null}

      {designs.state.status === 'error' ? (
        <ErrorState error={designs.state.error} onRetry={designs.reload} testID="designs-error" />
      ) : null}

      {designs.state.status === 'ready'
        ? designs.state.data.designs.map((design, index) => (
            <FadeIn key={design.id} delay={staggerDelay(index, 160)}>
              <DesignCard
                design={design}
                geometry={geometry}
                onPress={() => {
                  onOpenDesign(design.id);
                }}
                testID={`design-${design.id}`}
              />
            </FadeIn>
          ))
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
  },
  dotBox: { width: 12, height: 12, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  halo: { position: 'absolute', width: 8, height: 8, borderRadius: 4 },
  designs: { gap: spacing.md, marginTop: spacing.sm },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionTitle: { flex: 1 },
});
