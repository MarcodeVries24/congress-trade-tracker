import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chips } from '@/components/chips';
import { ListState } from '@/components/list-state';
import { SearchField } from '@/components/search-field';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { fetchIssuers, type IssuerSummary } from '@/lib/api';
import { compactUSD, shortDate } from '@/lib/format';
import { useAuthedRequest } from '@/lib/use-api';
import { useDebounced, usePaged } from '@/lib/use-paged';

const SORTS = [
  { key: 'trade_count', label: 'Most trades' },
  { key: 'politician_count', label: 'Most members' },
  { key: 'volume_sum', label: 'Largest volume' },
  { key: 'market_cap', label: 'Market cap' },
] as const;

type SortKey = (typeof SORTS)[number]['key'];

/**
 * Every listed company someone in Congress has traded, by ticker.
 *
 * The buy and sell split is on the row because it is the first thing anyone
 * asks about a stock here: is Congress getting in or getting out.
 */
export default function IssuersScreen() {
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const authed = useAuthedRequest();

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('trade_count');
  const q = useDebounced(query.trim());

  const load = useCallback(
    async (page: number) => fetchIssuers({ page, limit: 40, q: q || undefined, sort }, await authed()),
    [q, sort, authed]
  );
  const list = usePaged(load);

  const header = (
    <View style={[styles.controls, { paddingTop: Platform.OS === 'web' ? 60 : insets.top + 8 }]}>
      <SearchField value={query} onChangeText={setQuery} placeholder="Search ticker or company" />
      <Chips options={SORTS} value={sort} onChange={setSort} />
    </View>
  );

  const renderItem = ({ item }: { item: IssuerSummary }) => {
    const total = item.purchases + item.sales;
    const buyShare = total ? item.purchases / total : 0;
    return (
      <Pressable
        onPress={() => router.push({ pathname: '/issuer/[slug]', params: { slug: item.slug } })}
        style={({ pressed }) => [
          styles.row,
          { backgroundColor: colors.backgroundElement, opacity: pressed ? 0.7 : 1 },
        ]}>
        <View style={styles.rowTop}>
          <View style={styles.rowText}>
            <ThemedText style={styles.ticker}>{item.ticker}</ThemedText>
            <ThemedText numberOfLines={1} style={[styles.meta, { color: colors.textSecondary }]}>
              {item.company_name ?? item.ticker}
            </ThemedText>
          </View>
          <View style={styles.stats}>
            <ThemedText style={styles.statValue}>
              {sort === 'volume_sum'
                ? compactUSD(item.volume_sum)
                : sort === 'market_cap'
                  ? compactUSD(item.market_cap)
                  : sort === 'politician_count'
                    ? item.politician_count.toLocaleString()
                    : item.trade_count.toLocaleString()}
            </ThemedText>
            <ThemedText style={[styles.meta, { color: colors.textSecondary }]}>
              {sort === 'volume_sum'
                ? 'est. volume'
                : sort === 'market_cap'
                  ? 'market cap'
                  : sort === 'politician_count'
                    ? 'members'
                    : 'trades'}
            </ThemedText>
          </View>
        </View>
        <View style={[styles.split, { backgroundColor: colors.backgroundSelected }]}>
          <View style={[styles.splitBuy, { flex: buyShare }]} />
          <View style={[styles.splitSell, { flex: 1 - buyShare }]} />
        </View>
        <ThemedText style={[styles.meta, { color: colors.textSecondary }]}>
          {item.purchases.toLocaleString()} purchases · {item.sales.toLocaleString()} sales · last traded{' '}
          {shortDate(item.last_traded)}
        </ThemedText>
      </Pressable>
    );
  };

  if (list.status === 'error' && list.items.length === 0) {
    return (
      <ThemedView style={styles.screen}>
        {header}
        <ListState kind="error" title="Couldn't load companies" body={list.error} onRetry={list.retry} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.screen}>
      {header}
      {list.status === 'loading' && list.items.length === 0 ? (
        <ListState kind="loading" />
      ) : (
        <FlatList
          data={list.items}
          keyExtractor={(i) => i.slug}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} />}
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.6}
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <ListState kind="empty" title="No companies found" body={q ? `Nothing matches "${q}".` : null} />
          }
          ListFooterComponent={
            list.hasMore ? (
              <View style={styles.footer}>
                <ActivityIndicator />
              </View>
            ) : list.items.length ? (
              <View style={styles.footer}>
                <ThemedText style={[styles.meta, { color: colors.textSecondary }]}>
                  {list.total.toLocaleString()} companies
                </ThemedText>
              </View>
            ) : null
          }
        />
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  controls: { gap: 10, paddingBottom: 12 },
  list: { paddingBottom: 24, gap: 8 },
  row: { marginHorizontal: 16, padding: 12, borderRadius: 14, gap: 8 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowText: { flex: 1, gap: 2 },
  ticker: { fontSize: 16, fontWeight: '700' },
  meta: { fontSize: 12, lineHeight: 16 },
  stats: { alignItems: 'flex-end', gap: 1 },
  statValue: { fontSize: 15, fontWeight: '700' },
  split: { flexDirection: 'row', height: 4, borderRadius: 2, overflow: 'hidden' },
  splitBuy: { backgroundColor: '#1a9f5b' },
  splitSell: { backgroundColor: '#d6455d' },
  footer: { paddingVertical: 20, alignItems: 'center' },
});
