import type { Table } from '@athar/contracts';
import { useEffect, useRef, type ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { DesignCard } from '../../components/DesignCard';
import { ErrorState } from '../../components/ErrorState';
import { LoadingState } from '../../components/LoadingState';
import { ModeBadge } from '../../components/ModeBadge';
import { NoticeCard } from '../../components/NoticeCard';
import { FadeIn } from '../../components/FadeIn';
import { Screen } from '../../components/Screen';
import { useTheme } from '../../components/use-theme';
import { useI18n } from '../../i18n/context';
import { radius, spacing } from '../../theme';
import { useDesigns } from '../designs/useDesigns';
import { LightControl } from '../light/LightControl';
import { ShareControl } from '../share/ShareControl';
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

      {view === 'ready' ? <DesignList onOpenDesign={onOpenDesign} /> : null}

      {capabilities.light && view !== 'disabled' ? <LightControl tableId={data.id} /> : null}
      {capabilities.share ? <ShareControl tableId={data.id} /> : null}
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
      onPress={() => {
        onWatchJob(jobId);
      }}
      testID="table-watch"
    />
  );
}

function TableHeader({ table }: { readonly table: Table }): ReactElement {
  const { t } = useI18n();
  const theme = useTheme();
  const live = table.enabled && table.connection === 'online';

  return (
    <FadeIn style={styles.header}>
      <ModeBadge mode={table.mode} testID="table-mode" />
      <AppText variant="display">{table.displayName}</AppText>
      <AppText tone="textMuted">{table.location}</AppText>
      <View style={[styles.status, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={[styles.dot, { backgroundColor: live ? theme.success : theme.warning }]} />
        <AppText variant="label" tone="accentText" testID="table-connection">
          {`${t('table.status')}: ${t(table.enabled ? CONNECTION_LABEL_KEY[table.connection] : 'table.connection.disabled')}`}
        </AppText>
      </View>
    </FadeIn>
  );
}

function DesignList({
  onOpenDesign,
}: {
  readonly onOpenDesign: (designId: string) => void;
}): ReactElement {
  const { t } = useI18n();
  const theme = useTheme();
  const designs = useDesigns();

  return (
    <View style={styles.designs}>
      <View style={styles.sectionHeading}>
        <View style={[styles.sectionRule, { backgroundColor: theme.gold }]} />
        <AppText variant="heading">{t('table.designsTitle')}</AppText>
      </View>

      {designs.state.status === 'loading' ? <LoadingState testID="designs-loading" /> : null}

      {designs.state.status === 'error' ? (
        <ErrorState error={designs.state.error} onRetry={designs.reload} testID="designs-error" />
      ) : null}

      {designs.state.status === 'ready'
        ? designs.state.data.designs.map((design, index) => (
            <FadeIn key={design.id} delay={index * 90}>
              <DesignCard
                design={design}
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
  header: { gap: spacing.sm, alignItems: 'flex-start', paddingTop: spacing.sm },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    marginTop: spacing.xs,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  designs: { gap: spacing.md, marginTop: spacing.md },
  sectionHeading: { gap: spacing.sm },
  sectionRule: { width: 32, height: 3, borderRadius: 2 },
});
