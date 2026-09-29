import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View, useColorScheme } from 'react-native';

import { CompactTradeRow } from '@/components/compact-trade-row';
import { ListState } from '@/components/list-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { fetchIssuer, type IssuerDetail } from '@/lib/api';
import { tradesFromIssuer } from '@/lib/detail-trades';
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
 * One company: how much Congress has traded it, who, and the latest trades.
 *
 * The same function the website's issuer page renders from. The traders row
 * is the way across to a member, which is how people actually explore this:
 * from a stock to who holds it, and from them to what else they hold.
 */
export default function IssuerScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const router = useRouter();
  const authed = useAuthedRequest();

  const [detail, setDetail] = useState<IssuerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setDetail(await fetchIssuer(slug, await authed()));
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

  const trades = useMemo(() => (detail ? tradesFromIssuer(detail) : []), [detail]);
  // So a tap on one opens the trade screen straight from memory.
  useEffect(() => rememberTrades(trades), [trades]);

  if (!detail) {
    return (
      <ThemedView style={styles.screen}>
        <Stack.Screen options={{ title: slug?.toUpperCase() ?? '' }} />
        {error ? (
          <ListState
            kind="error"
            title="Couldn't load this company"
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

  const i = detail.issuer;

  const header = (
    <View style={styles.header}>
      <View>
        <ThemedText style={styles.ticker}>{i.ticker}</ThemedText>
        {i.company_name ? (
          <ThemedText style={[styles.company, { color: colors.textSecondary }]}>{i.company_name}</ThemedText>
        ) : null}
      </View>

      <View style={styles.stats}>
        <Stat label="Trades" value={i.trade_count.toLocaleString()} />
        <Stat label="Members" value={i.politician_count.toLocaleString()} />
        <Stat label="Purchases" value={i.purchases.toLocaleString()} />
        <Stat label="Sales" value={i.sales.toLocaleString()} />
        <Stat label="Est. volume" value={compactUSD(i.volume_sum)} />
        <Stat label="Market cap" value={i.market_cap ? compactUSD(i.market_cap) : '—'} />
      </View>
      <ThemedText style={[styles.note, { color: colors.textSecondary }]}>
        Last traded {shortDate(i.last_traded)}, last disclosed {shortDate(i.last_filed)}. Volume is estimated from the
        midpoints of the disclosed ranges.
      </ThemedText>

      {detail.traders.length ? (
        <>
          <ThemedText style={styles.section}>Who traded it</ThemedText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.traders}>
            {detail.traders.map((t) => (
              <Pressable
                key={t.slug ?? t.member_name}
                disabled={!t.slug}
                onPress={() => t.slug && router.push({ pathname: '/politician/[slug]', params: { slug: t.slug } })}
                style={[styles.trader, { backgroundColor: colors.backgroundElement }]}>
                {t.photo_url ? (
                  <Image source={{ uri: t.photo_url }} style={styles.traderPhoto} contentFit="cover" />
                ) : (
                  <View style={[styles.traderPhoto, { backgroundColor: colors.backgroundSelected }]} />
                )}
                <View style={[styles.traderParty, { backgroundColor: partyColor(t.party) }]} />
                <ThemedText numberOfLines={2} style={styles.traderName}>
                  {t.display}
                </ThemedText>
                <ThemedText style={[styles.traderCount, { color: colors.textSecondary }]}>
                  {t.trade_count} {t.trade_count === 1 ? 'trade' : 'trades'}
                </ThemedText>
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : null}

      <ThemedText style={styles.section}>
        {trades.length < i.trade_count ? `Latest ${trades.length} trades` : 'Trades'}
      </ThemedText>
    </View>
  );

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title: i.ticker }} />
      <FlatList
        data={trades}
        keyExtractor={(t) => String(t.id)}
        renderItem={({ item }) => <CompactTradeRow trade={item} lead="member" />}
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
  ticker: { fontSize: 26, fontWeight: '800', lineHeight: 32 },
  company: { fontSize: 15 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { flexGrow: 1, flexBasis: '30%', padding: 12, borderRadius: 12, gap: 2 },
  statValue: { fontSize: 17, fontWeight: '700' },
  statLabel: { fontSize: 12 },
  note: { fontSize: 12, lineHeight: 17 },
  section: { marginTop: 8, fontSize: 16, fontWeight: '700' },
  traders: { gap: 8 },
  trader: { width: 104, padding: 10, borderRadius: 12, gap: 6, alignItems: 'center' },
  traderPhoto: { width: 48, height: 48, borderRadius: 24 },
  traderParty: { width: 20, height: 3, borderRadius: 2 },
  traderName: { fontSize: 12, fontWeight: '600', textAlign: 'center', lineHeight: 16 },
  traderCount: { fontSize: 11 },
});
