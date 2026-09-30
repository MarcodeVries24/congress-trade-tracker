import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { fetchIssuers, type IssuerSummary } from '@/lib/api';
import { compactUSD } from '@/lib/format';
import { useAuthedRequest } from '@/lib/use-api';
import { useDebounced, usePaged } from '@/lib/use-paged';
import { radius, useTheme } from '@/theme';
import { ChipRow } from '@/ui/chip-row';
import { EmptyState } from '@/ui/empty-state';
import { Icon } from '@/ui/icon';
import { SearchBar } from '@/ui/search-bar';
import { SentimentBar } from '@/ui/sentiment-bar';
import { RowSkeleton } from '@/ui/skeleton';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';
import { TickerLogo } from '@/ui/ticker-logo';

const SORTS = [
  { key: 'trade_count', label: 'Most trades' },
  { key: 'politician_count', label: 'Most members' },
  { key: 'volume_sum', label: 'Largest volume' },
  { key: 'market_cap', label: 'Market cap' },
  { key: 'last_traded', label: 'Recently traded' },
] as const;

type SortKey = (typeof SORTS)[number]['key'];

/**
 * Every listed company someone in Congress has traded.
 *
 * Each card carries the buy/sell bar, because the first question anyone asks
 * about a stock here is whether Congress is getting in or getting out.
 */
export default function IssuersScreen() {
  const { c } = useTheme();
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

  const renderItem = ({ item }: { item: IssuerSummary }) => (
    <Tap
      scaleTo={0.98}
      feedback="tap"
      onPress={() => router.push({ pathname: '/issuer/[slug]', params: { slug: item.slug } })}
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.top}>
        <TickerLogo ticker={item.ticker} size={48} />
        <View style={styles.text}>
          <Text variant="subhead">{item.ticker}</Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {item.company_name ?? 'Listed company'}
          </Text>
        </View>
        <Icon name="chevron-forward" size={18} color={c.textFaint} />
      </View>
      <View style={styles.meta}>
        <Text variant="footnote" tone="muted">
          {item.trade_count.toLocaleString()} trades
        </Text>
        <Text variant="footnote" tone="muted">
          {item.politician_count} members
        </Text>
        <Text variant="footnote" tone="muted">
          {compactUSD(item.volume_sum)} vol.
        </Text>
        {item.market_cap ? (
          <Text variant="footnote" tone="muted">
            {compactUSD(item.market_cap)} cap
          </Text>
        ) : null}
      </View>
      <SentimentBar buys={item.purchases} sells={item.sales} />
    </Tap>
  );

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <FlatList
        data={list.items}
        keyExtractor={(i) => i.slug}
        renderItem={renderItem}
        ListHeaderComponent={
          <View style={styles.controls}>
            <View style={styles.inset}>
              <SearchBar value={query} onChangeText={setQuery} placeholder="Search ticker or company" />
            </View>
            <ChipRow options={SORTS} value={sort} onChange={setSort} />
            {list.status === 'loading' && list.items.length === 0 ? <RowSkeleton count={7} /> : null}
          </View>
        }
        ListEmptyComponent={
          list.status === 'error' ? (
            <EmptyState
              icon="cloud-offline-outline"
              title="Couldn't load companies"
              body={list.error}
              action="Try again"
              onAction={list.retry}
              compact
            />
          ) : list.status === 'ready' ? (
            <EmptyState
              icon="search-outline"
              title="No companies found"
              body={q ? `Nothing matches "${q}".` : null}
              compact
            />
          ) : null
        }
        ListFooterComponent={
          list.hasMore ? (
            <View style={styles.footer}>
              <ActivityIndicator />
            </View>
          ) : list.items.length ? (
            <Text variant="caption" tone="faint" style={styles.total}>
              {list.total.toLocaleString()} companies
            </Text>
          ) : null
        }
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.6}
        refreshControl={
          <RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={c.textMuted} />
        }
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingBottom: 40, gap: 10 },
  controls: { gap: 12, paddingBottom: 6 },
  inset: { paddingHorizontal: 16 },
  card: { marginHorizontal: 16, padding: 16, gap: 12, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  text: { flex: 1, gap: 2 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 2 },
  footer: { paddingVertical: 24, alignItems: 'center' },
  total: { textAlign: 'center', paddingVertical: 24 },
});
