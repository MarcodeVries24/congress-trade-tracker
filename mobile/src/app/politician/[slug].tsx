import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View, useColorScheme } from 'react-native';

import { CompactTradeRow } from '@/components/compact-trade-row';
import { ListState } from '@/components/list-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { fetchPolitician, type PoliticianDetail } from '@/lib/api';
import { tradesFromPolitician } from '@/lib/detail-trades';
import { compactUSD, partyColor, shortDate } from '@/lib/format';
import { rememberTrades } from '@/lib/trade-cache';
import { useAuthedRequest } from '@/lib/use-api';

function Stat({ label, value }: { label: string; value: string }) {
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  return (
    <View style={[styles.stat, { backgroundColor: colors.backgroundElement }]}>
      <ThemedText style={styles.statValue}>{value}</ThemedText>
      <ThemedText style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</ThemedText>
    </View>
  );
}

/**
 * One member: who they are, how much they trade, what they trade most, and
 * their hundred most recent trades.
 *
 * The same data as the website's member page, from the same function, so the
 * totals match to the trade. The trades open the trade screen, which is where
 * the source filing is one tap away.
 */
export default function PoliticianScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const router = useRouter();
  const authed = useAuthedRequest();

  const [detail, setDetail] = useState<PoliticianDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      let found = await fetchPolitician(slug, await authed());
      // An old spelling's slug answers with where the member lives now.
      if (found.redirectTo) found = await fetchPolitician(found.redirectTo, await authed());
      setDetail(found);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setRefreshing(false);
    }
  }, [slug, authed]);

  useEffect(() => {
    // Every state update in load is behind an await, as in the trades screen.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const trades = useMemo(() => (detail ? tradesFromPolitician(detail) : []), [detail]);
  // So a tap on one opens the trade screen straight from memory.
  useEffect(() => rememberTrades(trades), [trades]);

  if (!detail) {
    return (
      <ThemedView style={styles.screen}>
        <Stack.Screen options={{ title: '' }} />
        {error ? (
          <ListState
            kind="error"
            title="Couldn't load this member"
            body={error}
            onRetry={() => {
              setError(null);
              void load();
            }}
          />
        ) : (
          <ListState kind="loading" />
        )}
      </ThemedView>
    );
  }

  const p = detail.profile;
  const where = p.chamber === 'senate' ? p.state : (p.state_district ?? p.state);
  const role = p.chamber === 'senate' ? 'Senator' : p.chamber === 'house' ? 'Representative' : null;

  const header = (
    <View style={styles.header}>
      <View style={styles.identity}>
        {p.photo_url ? (
          <Image source={{ uri: p.photo_url }} style={styles.photo} contentFit="cover" transition={150} />
        ) : (
          <View style={[styles.photo, { backgroundColor: colors.backgroundSelected }]} />
        )}
        <View style={styles.identityText}>
          <ThemedText style={styles.name}>{p.display}</ThemedText>
          <View style={styles.subtitleRow}>
            {p.party ? <View style={[styles.partyBar, { backgroundColor: partyColor(p.party) }]} /> : null}
            <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>
              {[role, where, p.party].filter(Boolean).join(' · ')}
            </ThemedText>
          </View>
        </View>
      </View>

      <View style={styles.stats}>
        <Stat label="Trades" value={p.trade_count.toLocaleString()} />
        <Stat label="Est. volume" value={compactUSD(p.volume_sum)} />
        <Stat label="Purchases" value={p.purchases.toLocaleString()} />
        <Stat label="Sales" value={p.sales.toLocaleString()} />
      </View>
      <ThemedText style={[styles.note, { color: colors.textSecondary }]}>
        Filing since {shortDate(p.first_filed)}, most recently {shortDate(p.last_filed)}. Volume is estimated from the
        midpoints of the disclosed ranges.
      </ThemedText>

      {p.top_tickers.length ? (
        <>
          <ThemedText style={styles.section}>Most traded</ThemedText>
          <View style={styles.tickers}>
            {p.top_tickers.map((t) => (
              <Pressable
                key={t.ticker}
                onPress={() => router.push({ pathname: '/issuer/[slug]', params: { slug: t.ticker.toLowerCase() } })}
                style={[styles.ticker, { backgroundColor: colors.backgroundElement }]}>
                <ThemedText style={styles.tickerLabel}>{t.ticker}</ThemedText>
                <ThemedText style={[styles.tickerCount, { color: colors.textSecondary }]}>{t.count}</ThemedText>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      <ThemedText style={styles.section}>
        {trades.length < p.trade_count ? `Latest ${trades.length} trades` : 'Trades'}
      </ThemedText>
    </View>
  );

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title: p.display }} />
      <FlatList
        data={trades}
        keyExtractor={(t) => String(t.id)}
        renderItem={({ item }) => <CompactTradeRow trade={item} lead="asset" />}
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
        contentContainerStyle={styles.list}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingBottom: 32 },
  header: { padding: 16, gap: 12 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  photo: { width: 72, height: 72, borderRadius: 36 },
  identityText: { flex: 1, gap: 4 },
  name: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  subtitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  partyBar: { width: 4, height: 14, borderRadius: 2 },
  subtitle: { fontSize: 13, flexShrink: 1 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { flexGrow: 1, flexBasis: '45%', padding: 12, borderRadius: 12, gap: 2 },
  statValue: { fontSize: 18, fontWeight: '700' },
  statLabel: { fontSize: 12 },
  note: { fontSize: 12, lineHeight: 17 },
  section: { marginTop: 8, fontSize: 16, fontWeight: '700' },
  tickers: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  ticker: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  tickerLabel: { fontSize: 13, fontWeight: '700' },
  tickerCount: { fontSize: 12 },
});
