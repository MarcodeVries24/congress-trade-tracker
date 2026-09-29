import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TradeCard } from '@/components/trade-card';
import { Colors } from '@/constants/theme';
import { fetchTrades, type Trade } from '@/lib/api';

const PAGE_SIZE = 25;
const CHAMBERS = [
  { key: 'both', label: 'All', value: ['house', 'senate'] as const },
  { key: 'house', label: 'House', value: ['house'] as const },
  { key: 'senate', label: 'Senate', value: ['senate'] as const },
] as const;

type ChamberKey = (typeof CHAMBERS)[number]['key'];

/**
 * The feed.
 *
 * Paging is by page number rather than a cursor because that is what
 * /api/trades takes. The in-flight request is tracked with a ref rather than
 * state so that a scroll to the bottom cannot fire two identical requests
 * before the first setState lands.
 */
export default function TradesScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();

  const [chamber, setChamber] = useState<ChamberKey>('both');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loading = useRef(false);

  const load = useCallback(
    async (nextPage: number, replace: boolean) => {
      if (loading.current) return;
      loading.current = true;
      if (replace && nextPage === 1) setStatus((s) => (s === 'ready' ? s : 'loading'));
      try {
        const selected = CHAMBERS.find((c) => c.key === chamber)!.value;
        const res = await fetchTrades({ page: nextPage, limit: PAGE_SIZE, chamber: [...selected] });
        setTrades((prev) => (replace ? res.data : [...prev, ...res.data]));
        setPage(res.page);
        setTotalPages(res.totalPages);
        setStatus('ready');
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
        if (replace) setStatus('error');
      } finally {
        loading.current = false;
        setRefreshing(false);
      }
    },
    [chamber]
  );

  useEffect(() => {
    setTrades([]);
    load(1, true);
  }, [load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(1, true);
  }, [load]);

  const onEndReached = useCallback(() => {
    if (status === 'ready' && page < totalPages) load(page + 1, false);
  }, [status, page, totalPages, load]);

  if (status === 'loading' && trades.length === 0) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  if (status === 'error' && trades.length === 0) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText style={styles.errorTitle}>Couldn&apos;t load trades</ThemedText>
        <ThemedText style={[styles.errorBody, { color: colors.textSecondary }]}>{error}</ThemedText>
        <Pressable onPress={() => load(1, true)} style={[styles.retry, { backgroundColor: colors.backgroundSelected }]}>
          <ThemedText style={styles.retryLabel}>Try again</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <View style={[styles.segmented, { paddingTop: insets.top + 8 }]}>
        {CHAMBERS.map((c) => {
          const selected = c.key === chamber;
          return (
            <Pressable
              key={c.key}
              onPress={() => setChamber(c.key)}
              style={[
                styles.segment,
                { backgroundColor: selected ? colors.backgroundSelected : colors.backgroundElement },
              ]}>
              <ThemedText style={[styles.segmentLabel, { color: selected ? colors.text : colors.textSecondary }]}>
                {c.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={trades}
        keyExtractor={(t) => String(t.id)}
        renderItem={({ item }) => <TradeCard trade={item} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.6}
        contentContainerStyle={styles.list}
        ListFooterComponent={
          page < totalPages ? (
            <View style={styles.footer}>
              <ActivityIndicator />
            </View>
          ) : (
            <View style={styles.footer}>
              <ThemedText style={[styles.end, { color: colors.textSecondary }]}>
                {trades.length.toLocaleString()} trades loaded
              </ThemedText>
            </View>
          )
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  errorTitle: { fontSize: 16, fontWeight: '600' },
  errorBody: { fontSize: 13, textAlign: 'center' },
  retry: { marginTop: 8, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999 },
  retryLabel: { fontSize: 14, fontWeight: '600' },
  segmented: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  segment: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  segmentLabel: { fontSize: 13, fontWeight: '600' },
  list: { paddingBottom: 24 },
  footer: { paddingVertical: 20, alignItems: 'center' },
  end: { fontSize: 12 },
});
