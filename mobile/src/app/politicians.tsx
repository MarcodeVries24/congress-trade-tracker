import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { fetchPoliticians, type PoliticianSummary } from '@/lib/api';
import { useFollows } from '@/lib/follows';
import { compactUSD, filedAgo, memberDisplayNameFromFiledName } from '@/lib/format';
import { useAuthedRequest } from '@/lib/use-api';
import { useDebounced, usePaged } from '@/lib/use-paged';
import { useTheme } from '@/theme';
import { Avatar } from '@/ui/avatar';
import { ChipRow } from '@/ui/chip-row';
import { EmptyState } from '@/ui/empty-state';
import { FollowStar } from '@/ui/follow-button';
import { SearchBar } from '@/ui/search-bar';
import { RowSkeleton } from '@/ui/skeleton';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

const CHAMBERS = [
  { key: 'both', label: 'Both chambers' },
  { key: 'house', label: 'House' },
  { key: 'senate', label: 'Senate' },
] as const;

const SORTS = [
  { key: 'trade_count', label: 'Most trades' },
  { key: 'volume_sum', label: 'Largest volume' },
  { key: 'last_filed', label: 'Recently filed' },
] as const;

type ChamberKey = (typeof CHAMBERS)[number]['key'];
type SortKey = (typeof SORTS)[number]['key'];

/**
 * Every member who has traded, one row per person.
 *
 * The server merges a member's filed spellings into one row, so the counts
 * are the person's, not a spelling's. Every row can be followed in place.
 */
export default function PoliticiansScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const authed = useAuthedRequest();
  const follows = useFollows();
  const [query, setQuery] = useState('');
  const [chamber, setChamber] = useState<ChamberKey>('both');
  const [sort, setSort] = useState<SortKey>('trade_count');
  const q = useDebounced(query.trim());

  const load = useCallback(
    async (page: number) =>
      fetchPoliticians(
        { page, limit: 40, q: q || undefined, sort, chamber: chamber === 'both' ? undefined : [chamber] },
        await authed()
      ),
    [q, sort, chamber, authed]
  );
  const list = usePaged(load);

  const renderItem = ({ item, index }: { item: PoliticianSummary; index: number }) => {
    const name = memberDisplayNameFromFiledName(item.member_name);
    const subtitle = [
      item.chamber === 'senate' ? item.member_state : item.state_district,
      item.chamber === 'senate' ? 'Senate' : 'House',
    ]
      .filter(Boolean)
      .join(' · ');
    const stat =
      sort === 'volume_sum'
        ? `${compactUSD(item.volume_sum)} est. volume`
        : sort === 'last_filed'
          ? `Filed ${filedAgo(item.last_filed).toLowerCase()}`
          : `${item.trade_count.toLocaleString()} trades`;
    return (
      <Tap
        scaleTo={0.985}
        onPress={() => router.push({ pathname: '/politician/[slug]', params: { slug: item.slug } })}
        style={styles.row}>
        <Avatar uri={item.photo_url} name={name} party={item.party} size={52} />
        <View
          style={[
            styles.body,
            index < list.items.length - 1 && {
              borderBottomColor: c.border,
              borderBottomWidth: StyleSheet.hairlineWidth,
            },
          ]}>
          <View style={styles.text}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {name}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {[item.party, subtitle].filter(Boolean).join(' · ')}
            </Text>
            <Text variant="footnote" tone="faint">
              {stat}
            </Text>
          </View>
          <FollowStar
            following={follows.isFollowingMember(item.slug)}
            onPress={() =>
              follows.toggleMember({ slug: item.slug, name, photo_url: item.photo_url, party: item.party, subtitle })
            }
          />
        </View>
      </Tap>
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <FlatList
        data={list.items}
        keyExtractor={(m) => m.slug}
        renderItem={renderItem}
        ListHeaderComponent={
          <View style={styles.controls}>
            <View style={styles.inset}>
              <SearchBar value={query} onChangeText={setQuery} placeholder="Search members" />
            </View>
            <ChipRow options={CHAMBERS} value={chamber} onChange={setChamber} />
            <ChipRow options={SORTS} value={sort} onChange={setSort} />
            {list.status === 'loading' && list.items.length === 0 ? <RowSkeleton count={8} /> : null}
          </View>
        }
        ListEmptyComponent={
          list.status === 'error' ? (
            <EmptyState
              icon="cloud-offline-outline"
              title="Couldn't load members"
              body={list.error}
              action="Try again"
              onAction={list.retry}
              compact
            />
          ) : list.status === 'ready' ? (
            <EmptyState
              icon="search-outline"
              title="No members found"
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
              {list.total.toLocaleString()} members
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
  list: { paddingBottom: 40 },
  controls: { gap: 12, paddingBottom: 8 },
  inset: { paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 20 },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingRight: 20 },
  text: { flex: 1, gap: 2 },
  footer: { paddingVertical: 24, alignItems: 'center' },
  total: { textAlign: 'center', paddingVertical: 24 },
});
