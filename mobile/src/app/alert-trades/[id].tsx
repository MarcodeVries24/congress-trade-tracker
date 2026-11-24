import { useAuth } from '@clerk/clerk-expo';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, View } from 'react-native';

import { fetchAlertTrades, type AlertTrades, type SentTrade } from '@/lib/api';
import { sentLabel } from '@/lib/sent-label';
import { fromAlertFilters } from '@/lib/trade-filters';
import { useAuthedRequest } from '@/lib/use-api';
import { useTheme } from '@/theme';
import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { TradeRowSkeleton } from '@/ui/skeleton';
import { Text } from '@/ui/text';
import { TradeRow } from '@/ui/trade-row';

type Section = { key: string; title: string; data: SentTrade[] };

/** One section per send: trades sent together share a sent_at. */
function bySend(trades: SentTrade[]): Section[] {
  const sections: Section[] = [];
  for (const trade of trades) {
    const last = sections[sections.length - 1];
    if (last && last.key === trade.sent_at) last.data.push(trade);
    else sections.push({ key: trade.sent_at, title: '', data: [trade] });
  }
  for (const s of sections) {
    s.title = `${sentLabel(s.key)} · ${s.data.length} ${s.data.length === 1 ? 'trade' : 'trades'}`;
  }
  return sections;
}

/**
 * The trades an alert has sent, grouped by the notification or email they
 * went out in, newest first. A tapped notification opens here, so the trades
 * it announced are at the top; the alert's own filters, which match much more
 * than was ever sent, are one button away.
 */
export default function AlertTradesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c } = useTheme();
  const router = useRouter();
  const { isLoaded, isSignedIn } = useAuth();
  const authed = useAuthedRequest();
  const [data, setData] = useState<AlertTrades | null>(null);
  const [error, setError] = useState<{ status: number; message: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await fetchAlertTrades(id, await authed()));
      setError(null);
    } catch (err) {
      const status = (err as { status?: number }).status ?? 0;
      setError({ status, message: err instanceof Error ? err.message : String(err) });
    } finally {
      setRefreshing(false);
    }
  }, [id, authed]);

  // A notification can open the app cold, before Clerk has read its session:
  // asking then would go out without a token and come back 401.
  useEffect(() => {
    // Every state update in load is behind an await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isLoaded && isSignedIn) void load();
  }, [isLoaded, isSignedIn, load]);

  const sections = useMemo(() => (data ? bySend(data.trades) : []), [data]);

  const seeAll = () => {
    if (!data) return;
    router.push({ pathname: '/trades', params: { filters: JSON.stringify(fromAlertFilters(data.alert.filters)) } });
  };

  if (isLoaded && !isSignedIn) {
    return (
      <View style={[styles.screen, { backgroundColor: c.background }]}>
        <EmptyState
          icon="person-circle-outline"
          title="Sign in to see this alert"
          body="Alerts belong to an account. Sign in with the one that set it up."
          action="Sign in"
          onAction={() => router.push('/sign-in')}
        />
      </View>
    );
  }

  if (error && !data) {
    return (
      <View style={[styles.screen, { backgroundColor: c.background }]}>
        {error.status === 404 ? (
          <EmptyState
            icon="notifications-off-outline"
            title="This alert is gone"
            body="It was deleted, or it belongs to another account."
            action="Your alerts"
            onAction={() => router.replace('/email-alerts')}
          />
        ) : (
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load this alert's trades"
            body={error.message}
            action="Try again"
            onAction={() => void load()}
          />
        )}
      </View>
    );
  }

  const header = data ? (
    <View style={styles.header}>
      <Text variant="title">{data.alert.name}</Text>
      <Text variant="callout" tone="muted">
        {data.alert.summary}
      </Text>
      <Button label="See every trade that matches" kind="secondary" size="md" icon="filter" onPress={seeAll} />
      {data.trades.length ? (
        <Text variant="caption" tone="muted">
          The trades this alert has sent you, newest first.
        </Text>
      ) : null}
    </View>
  ) : (
    <TradeRowSkeleton count={6} />
  );

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <Stack.Screen options={{ title: data ? 'Alert' : '' }} />
      <SectionList
        sections={sections}
        keyExtractor={(t) => `${t.sent_at}:${t.id}`}
        renderItem={({ item, index, section }) => <TradeRow trade={item} divider={index < section.data.length - 1} />}
        renderSectionHeader={({ section }) => (
          <View style={[styles.send, { backgroundColor: c.background }]}>
            <Text variant="label" tone="faint">
              {section.title.toUpperCase()}
            </Text>
          </View>
        )}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={header}
        ListEmptyComponent={
          data ? (
            <EmptyState
              icon="hourglass-outline"
              title="Nothing sent yet"
              body="When a new filing matches this alert, the trades it sends you show up here."
              compact
            />
          ) : null
        }
        ListFooterComponent={
          data && data.totalSent > data.trades.length ? (
            <Text variant="caption" tone="faint" style={styles.footer}>
              The latest {data.trades.length} of {data.totalSent.toLocaleString()} trades sent. Every one is in
              &ldquo;See every trade that matches&rdquo;.
            </Text>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={c.textMuted}
          />
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingBottom: 40 },
  header: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 6, gap: 10 },
  send: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 2 },
  footer: { textAlign: 'center', paddingHorizontal: 24, paddingVertical: 24 },
});
