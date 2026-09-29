import { Image } from 'expo-image';
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
import { fetchPoliticians, type PoliticianSummary } from '@/lib/api';
import { compactUSD, memberDisplayNameFromFiledName, partyColor, partyLetter, shortDate } from '@/lib/format';
import { useAuthedRequest } from '@/lib/use-api';
import { useDebounced, usePaged } from '@/lib/use-paged';

const CHAMBERS = [
  { key: 'both', label: 'All' },
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
 * The server merges a member's filed spellings into one row (Marjorie Taylor
 * Greene files under two, Scott Franklin under four), so the counts here are
 * the person's, not a spelling's. Search is applied after that merge, which is
 * why typing half of one spelling still finds the whole person.
 */
export default function PoliticiansScreen() {
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const authed = useAuthedRequest();

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

  const header = (
    <View style={[styles.controls, { paddingTop: Platform.OS === 'web' ? 60 : insets.top + 8 }]}>
      <SearchField value={query} onChangeText={setQuery} placeholder="Search members" />
      <Chips options={CHAMBERS} value={chamber} onChange={setChamber} />
      <Chips options={SORTS} value={sort} onChange={setSort} />
    </View>
  );

  const renderItem = ({ item }: { item: PoliticianSummary }) => (
    <Pressable
      onPress={() => router.push({ pathname: '/politician/[slug]', params: { slug: item.slug } })}
      style={({ pressed }) => [styles.row, { backgroundColor: colors.backgroundElement, opacity: pressed ? 0.7 : 1 }]}>
      {item.photo_url ? (
        <Image source={{ uri: item.photo_url }} style={styles.photo} contentFit="cover" transition={150} />
      ) : (
        <View style={[styles.photo, { backgroundColor: colors.backgroundSelected }]} />
      )}
      <View style={styles.rowText}>
        <ThemedText numberOfLines={1} style={styles.name}>
          {memberDisplayNameFromFiledName(item.member_name)}
        </ThemedText>
        <View style={styles.metaRow}>
          {item.party ? (
            <View style={[styles.partyDot, { backgroundColor: partyColor(item.party) }]}>
              <ThemedText style={styles.partyLetter}>{partyLetter(item.party)}</ThemedText>
            </View>
          ) : null}
          <ThemedText numberOfLines={1} style={[styles.meta, { color: colors.textSecondary }]}>
            {[
              item.chamber === 'senate' ? item.member_state : item.state_district,
              item.chamber === 'senate' ? 'Senate' : 'House',
            ]
              .filter(Boolean)
              .join(' · ')}
          </ThemedText>
        </View>
      </View>
      <View style={styles.stats}>
        <ThemedText style={styles.statValue}>
          {sort === 'volume_sum'
            ? compactUSD(item.volume_sum)
            : sort === 'last_filed'
              ? shortDate(item.last_filed)
              : item.trade_count.toLocaleString()}
        </ThemedText>
        <ThemedText style={[styles.meta, { color: colors.textSecondary }]}>
          {sort === 'volume_sum' ? 'est. volume' : sort === 'last_filed' ? 'last filed' : 'trades'}
        </ThemedText>
      </View>
    </Pressable>
  );

  if (list.status === 'error' && list.items.length === 0) {
    return (
      <ThemedView style={styles.screen}>
        {header}
        <ListState kind="error" title="Couldn't load members" body={list.error} onRetry={list.retry} />
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
          keyExtractor={(m) => m.slug}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} />}
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.6}
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <ListState kind="empty" title="No members found" body={q ? `Nothing matches "${q}".` : null} />
          }
          ListFooterComponent={
            list.hasMore ? (
              <View style={styles.footer}>
                <ActivityIndicator />
              </View>
            ) : list.items.length ? (
              <View style={styles.footer}>
                <ThemedText style={[styles.meta, { color: colors.textSecondary }]}>
                  {list.total.toLocaleString()} members
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    padding: 12,
    borderRadius: 14,
  },
  photo: { width: 44, height: 44, borderRadius: 22 },
  rowText: { flex: 1, gap: 3 },
  name: { fontSize: 15, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  partyDot: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  partyLetter: { fontSize: 10, lineHeight: 12, fontWeight: '800', color: '#ffffff' },
  meta: { fontSize: 12, lineHeight: 16 },
  stats: { alignItems: 'flex-end', gap: 1 },
  statValue: { fontSize: 15, fontWeight: '700' },
  footer: { paddingVertical: 20, alignItems: 'center' },
});
