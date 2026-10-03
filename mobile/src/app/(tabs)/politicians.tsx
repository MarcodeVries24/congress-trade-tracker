import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { fetchPoliticians, type PoliticianDetail, type PoliticianSummary } from '@/lib/api';
import { getPolitician } from '@/lib/detail-cache';
import { useFollows, type FollowedMember } from '@/lib/follows';
import { compactUSD, filedAgo, memberDisplayNameFromFiledName } from '@/lib/format';
import { useAuthedRequest } from '@/lib/use-api';
import { useDebounced, usePaged } from '@/lib/use-paged';
import { radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/avatar';
import { Button } from '@/ui/button';
import { ChipRow } from '@/ui/chip-row';
import { EmptyState } from '@/ui/empty-state';
import { FollowStar } from '@/ui/follow-button';
import { Icon } from '@/ui/icon';
import { SearchBar } from '@/ui/search-bar';
import { Segmented } from '@/ui/segmented';
import { RowSkeleton, Skeleton } from '@/ui/skeleton';
import { TabHeader } from '@/ui/tab-header';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

const VIEWS = [
  { key: 'all', label: 'All politicians' },
  { key: 'watchlist', label: 'Watchlist' },
] as const;
type ViewKey = (typeof VIEWS)[number]['key'];

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

function subtitleOf(m: PoliticianSummary): string {
  return [m.chamber === 'senate' ? m.member_state : m.state_district, m.chamber === 'senate' ? 'Senate' : 'House']
    .filter(Boolean)
    .join(' · ');
}

function asFollow(m: PoliticianSummary): FollowedMember {
  return {
    slug: m.slug,
    name: memberDisplayNameFromFiledName(m.member_name),
    photo_url: m.photo_url,
    party: m.party,
    subtitle: subtitleOf(m),
  };
}

/** One followed member: who, and what they did last. */
function WatchRow({
  member,
  detail,
  last,
}: {
  member: FollowedMember;
  detail: PoliticianDetail | undefined;
  last: boolean;
}) {
  const { c } = useTheme();
  const router = useRouter();
  const latest = detail?.trades[0];
  return (
    <Tap
      scaleTo={0.985}
      onPress={() => router.push({ pathname: '/politician/[slug]', params: { slug: member.slug } })}
      style={styles.row}>
      <Avatar uri={member.photo_url} name={member.name} party={member.party} size={52} ring />
      <View
        style={[styles.body, !last && { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        <View style={styles.text}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {member.name}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {[member.party, member.subtitle].filter(Boolean).join(' · ')}
          </Text>
          {detail ? (
            <Text variant="footnote" tone="faint" numberOfLines={1}>
              {detail.profile.trade_count.toLocaleString()} trades
              {latest ? ` · last filed ${filedAgo(latest.filing_date).toLowerCase()}` : ''}
            </Text>
          ) : (
            <Skeleton width={120} height={10} />
          )}
        </View>
        <Icon name="chevron-forward" size={18} color={c.textFaint} />
      </View>
    </Tap>
  );
}

/**
 * Politicians: everyone who files, and beside them the ones you follow.
 *
 * "All politicians" is the directory, searchable and sortable, with a star on
 * every row. "Watchlist" is the starred ones, each with what they last did;
 * their trades are what fill the Alerts tab.
 */
export default function PoliticiansScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const authed = useAuthedRequest();
  const follows = useFollows();
  const params = useLocalSearchParams<{ view?: string }>();
  const [view, setView] = useState<ViewKey>(params.view === 'watchlist' ? 'watchlist' : 'all');
  // Arriving from elsewhere with "watchlist" picks that side, even though the
  // tab is already mounted. Adopted while rendering, as React recommends.
  const [lastParam, setLastParam] = useState(params.view);
  if (params.view !== lastParam) {
    setLastParam(params.view);
    if (params.view === 'watchlist' || params.view === 'all') setView(params.view);
  }

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

  // The watchlist's detail: trade counts and the last filing, per member.
  const [details, setDetails] = useState<Record<string, PoliticianDetail>>({});
  const [refreshing, setRefreshing] = useState(false);
  const loadWatch = useCallback(
    async (fresh = false) => {
      const options = await authed();
      await Promise.all(
        follows.members.map((m) =>
          getPolitician(m.slug, options, fresh)
            .then((d) => setDetails((prev) => ({ ...prev, [m.slug]: d })))
            .catch(() => {})
        )
      );
      setRefreshing(false);
    },
    [authed, follows.members]
  );
  useFocusEffect(
    useCallback(() => {
      void loadWatch();
    }, [loadWatch])
  );

  const renderMember = ({ item, index }: { item: PoliticianSummary; index: number }) => {
    const name = memberDisplayNameFromFiledName(item.member_name);
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
              {[item.party, subtitleOf(item)].filter(Boolean).join(' · ')}
            </Text>
            <Text variant="footnote" tone="faint">
              {stat}
            </Text>
          </View>
          <FollowStar
            following={follows.isFollowingMember(item.slug)}
            onPress={() => follows.toggleMember(asFollow(item))}
          />
        </View>
      </Tap>
    );
  };

  const top = (
    <View style={styles.controls}>
      <TabHeader title="Politicians" />
      <View style={styles.inset}>
        <Segmented options={VIEWS} value={view} onChange={setView} />
      </View>
    </View>
  );

  if (view === 'watchlist') {
    // The directory's first page doubles as suggestions: the most active,
    // minus anyone already followed.
    const suggestions = list.items.filter((m) => !follows.isFollowingMember(m.slug)).slice(0, 6);
    return (
      <View style={[styles.screen, { backgroundColor: c.background }]}>
        <FlatList
          data={follows.members}
          keyExtractor={(m) => m.slug}
          renderItem={({ item, index }) => (
            <WatchRow member={item} detail={details[item.slug]} last={index === follows.members.length - 1} />
          )}
          ListHeaderComponent={
            <View>
              {top}
              {follows.members.length ? (
                <Text variant="footnote" tone="faint" style={styles.count}>
                  {follows.members.length} {follows.members.length === 1 ? 'member' : 'members'} followed. Their trades
                  fill the Alerts tab.
                </Text>
              ) : (
                <EmptyState
                  icon="star-outline"
                  title="Nobody on your watchlist"
                  body="Tap the star next to a member to follow them. Every trade they disclose lands in Alerts."
                  compact
                />
              )}
            </View>
          }
          ListFooterComponent={
            <View style={styles.suggest}>
              {suggestions.length ? (
                <>
                  <Text variant="headline">{follows.members.length ? 'Suggested for you' : 'Most active traders'}</Text>
                  <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
                    {suggestions.map((m, i) => (
                      <Tap
                        key={m.slug}
                        scaleTo={0.985}
                        onPress={() => router.push({ pathname: '/politician/[slug]', params: { slug: m.slug } })}
                        style={styles.row}>
                        <Avatar
                          uri={m.photo_url}
                          name={memberDisplayNameFromFiledName(m.member_name)}
                          party={m.party}
                          size={44}
                        />
                        <View
                          style={[
                            styles.body,
                            i < suggestions.length - 1 && {
                              borderBottomColor: c.border,
                              borderBottomWidth: StyleSheet.hairlineWidth,
                            },
                          ]}>
                          <View style={styles.text}>
                            <Text variant="bodyStrong" numberOfLines={1}>
                              {memberDisplayNameFromFiledName(m.member_name)}
                            </Text>
                            <Text variant="caption" tone="muted" numberOfLines={1}>
                              {subtitleOf(m)} · {m.trade_count.toLocaleString()} trades
                            </Text>
                          </View>
                          <FollowStar following={false} onPress={() => follows.toggleMember(asFollow(m))} />
                        </View>
                      </Tap>
                    ))}
                  </View>
                </>
              ) : null}
              <Button label="Browse all politicians" icon="people-outline" kind="secondary" onPress={() => setView('all')} />
            </View>
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadWatch(true);
              }}
              tintColor={c.textMuted}
            />
          }
          contentContainerStyle={styles.list}
        />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <FlatList
        data={list.items}
        keyExtractor={(m) => m.slug}
        renderItem={renderMember}
        ListHeaderComponent={
          <View style={styles.controls}>
            {top}
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
  count: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 16 },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingRight: 16 },
  text: { flex: 1, gap: 2 },
  suggest: { gap: 14, paddingHorizontal: 16, paddingTop: 28 },
  card: { borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  footer: { paddingVertical: 24, alignItems: 'center' },
  total: { textAlign: 'center', paddingVertical: 24 },
});
