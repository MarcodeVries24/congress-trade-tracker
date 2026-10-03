import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { fetchTiming, type TimingOverview } from '@/lib/api';
import { rememberTrades } from '@/lib/trade-cache';
import { useAuthedRequest } from '@/lib/use-api';
import { radius, useTheme } from '@/theme';
import { EmptyState } from '@/ui/empty-state';
import { NotAdvice } from '@/ui/not-advice';
import { Segmented } from '@/ui/segmented';
import { RowSkeleton, Skeleton } from '@/ui/skeleton';
import { Text } from '@/ui/text';
import { FeaturedTiming, LeaderRow, TimedTradeRow } from '@/ui/timing-feature';

const WINDOWS = [
  { key: '30', label: '30 days' },
  { key: '90', label: '90 days' },
  { key: '365', label: 'Year' },
] as const;
type WindowKey = (typeof WINDOWS)[number]['key'];

/**
 * Congress's best trades in full, the app's counterpart of the website's
 * /best-trades: the trades disclosed in a window that have done best since
 * they were made, and the members whose trades do best on average. Opens with
 * the not-financial-advice note, since this is the screen most likely to be
 * read as tips.
 */
export default function TimingScreen() {
  const { c } = useTheme();
  const authed = useAuthedRequest();
  const [window, setWindow] = useState<WindowKey>('90');
  const [data, setData] = useState<TimingOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (days: WindowKey) => {
      try {
        const overview = await fetchTiming(Number(days) as 30 | 90 | 365, await authed());
        rememberTrades(overview.trades);
        setData(overview);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        setRefreshing(false);
      }
    },
    [authed]
  );

  useEffect(() => {
    // Every state update in load is behind an await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(window);
  }, [load, window]);

  const shown = data && String(data.days) === window ? data : null;
  const [top, ...rest] = shown?.trades ?? [];

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load(window);
          }}
          tintColor={c.textMuted}
        />
      }>
      <View style={styles.intro}>
        <Text variant="title">Congress&apos;s best trades</Text>
        <Text variant="body" tone="muted">
          What each disclosed trade has returned since the day it was made, to the latest close: the rise since a
          purchase, or the fall a sale got out ahead of. Only trades filed within the 45 days the law allows.
        </Text>
      </View>

      <NotAdvice banner />

      <Segmented options={WINDOWS} value={window} onChange={setWindow} />

      {error && !shown ? (
        <EmptyState icon="cloud-offline-outline" title="Couldn't load the ranking" body={error} action="Try again" onAction={() => void load(window)} compact />
      ) : !shown ? (
        <>
          <Skeleton width="100%" height={320} round={20} />
          <RowSkeleton count={5} />
        </>
      ) : (
        <>
          {top ? <FeaturedTiming trade={top} /> : <Text tone="muted">No priced trades were disclosed in this window yet.</Text>}

          {rest.length ? (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <Text variant="subhead">Best trades</Text>
              {rest.map((t, i) => (
                <TimedTradeRow key={t.id} trade={t} rank={i + 2} divider={i < rest.length - 1} />
              ))}
            </View>
          ) : null}

          {shown.leaders.length ? (
            <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
              <View style={styles.cardHead}>
                <Text variant="subhead">Members whose trades do best</Text>
                <Text variant="caption" tone="muted">
                  Average return since the trade, for every trade disclosed on time in the past year, among members
                  with at least five.
                </Text>
              </View>
              {shown.leaders.map((l, i) => (
                <LeaderRow key={l.slug} leader={l} rank={i + 1} divider={i < shown.leaders.length - 1} />
              ))}
            </View>
          ) : null}

          <View style={[styles.card, { backgroundColor: c.surfaceMuted, borderColor: c.border }]}>
            <Text variant="subhead">How this is worked out</Text>
            <Text variant="caption" tone="muted">
              Each trade is priced at the stock&apos;s daily close on the day it was made and at the latest close,
              split-adjusted. A purchase counts by how much the stock has risen since, a sale by how much it has fallen
              since. Filings give a value range, never the price paid, so this is the stock&apos;s return, not the
              member&apos;s profit. Several lots of one stock in a filing count once, no member appears more than twice,
              and moves over 400% (usually a mismatched listing) are left out. Only trades filed on time are ranked.
              Prices update every weekday evening; new trades are priced within hours of being filed.
            </Text>
            <NotAdvice long />
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  intro: { gap: 6 },
  card: { borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 4 },
  cardHead: { gap: 2, marginBottom: 4 },
});
