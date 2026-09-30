import { useUser } from '@clerk/clerk-expo';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { fetchTrades, type Trade } from '@/lib/api';
import { memberName, surname } from '@/lib/format';
import { useOnboarding } from '@/lib/onboarding';
import { rememberTrades } from '@/lib/trade-cache';
import { useAuthedRequest } from '@/lib/use-api';
import { brand, radius, shadow, useTheme } from '@/theme';
import { Avatar } from '@/ui/avatar';
import { Button, IconButton } from '@/ui/button';
import { Card } from '@/ui/card';
import { ChipRow } from '@/ui/chip-row';
import { EmptyState } from '@/ui/empty-state';
import { Icon, type IconName } from '@/ui/icon';
import { SearchBar } from '@/ui/search-bar';
import { SectionHeader } from '@/ui/section';
import { SentimentBar } from '@/ui/sentiment-bar';
import { RowSkeleton, Skeleton } from '@/ui/skeleton';
import { TabHeader } from '@/ui/tab-header';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';
import { TickerLogo } from '@/ui/ticker-logo';
import { TradeRow } from '@/ui/trade-row';

const CHAMBERS = [
  { key: 'both', label: 'All trades' },
  { key: 'house', label: 'House' },
  { key: 'senate', label: 'Senate' },
] as const;
type ChamberKey = (typeof CHAMBERS)[number]['key'];

const PAGE = 30;

type Story = { slug: string; name: string; photo: string | null; party: string | null; count: number };
type Trending = { ticker: string; company: string | null; count: number; buys: number; sells: number; members: number };

/**
 * The latest trades read two more ways: who has just filed (the stories row)
 * and which stocks keep coming up (trending). Worked out here from one request
 * rather than asked of the server, because "recent" is exactly what the feed
 * already is.
 */
function digest(trades: Trade[]): { stories: Story[]; trending: Trending[] } {
  const stories = new Map<string, Story>();
  const tickers = new Map<string, Trending & { who: Set<string> }>();
  for (const t of trades) {
    const key = t.member_slug ?? t.member_name;
    const story = stories.get(key);
    if (story) story.count += 1;
    else if (t.member_slug) {
      stories.set(key, { slug: t.member_slug, name: memberName(t), photo: t.photo_url, party: t.party, count: 1 });
    }
    if (!t.ticker) continue;
    const entry = tickers.get(t.ticker) ?? {
      ticker: t.ticker,
      company: t.company_name ?? null,
      count: 0,
      buys: 0,
      sells: 0,
      members: 0,
      who: new Set<string>(),
    };
    entry.count += 1;
    if (t.transaction_type.startsWith('P')) entry.buys += 1;
    if (t.transaction_type.startsWith('S')) entry.sells += 1;
    entry.who.add(key);
    entry.members = entry.who.size;
    tickers.set(t.ticker, entry);
  }
  return {
    stories: [...stories.values()].slice(0, 16),
    trending: [...tickers.values()]
      .filter((t) => t.count >= 2)
      .sort((a, b) => b.members - a.members || b.count - a.count)
      .slice(0, 10),
  };
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Up late';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

/**
 * Discover: the home tab.
 *
 * Built like the apps people open without thinking: a search pill at the top,
 * a row of faces who just did something, a swipeable way to find more, cards
 * to scroll sideways, and then the feed itself, endless, one trade per row.
 */
export default function DiscoverScreen() {
  const { c, scheme } = useTheme();
  const router = useRouter();
  const authed = useAuthedRequest();
  const { user } = useUser();
  const { answers } = useOnboarding();

  const [chamber, setChamber] = useState<ChamberKey>(answers.chamber === 'both' ? 'both' : answers.chamber);
  const [recent, setRecent] = useState<Trade[] | null>(null);
  const [feed, setFeed] = useState<Trade[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loadingMore = useRef(false);
  const generation = useRef(0);

  const loadRecent = useCallback(async () => {
    try {
      const res = await fetchTrades({ page: 1, limit: 200 }, await authed());
      rememberTrades(res.data);
      setRecent(res.data);
    } catch {
      setRecent((prev) => prev ?? []);
    }
  }, [authed]);

  const loadFeed = useCallback(
    async (nextPage: number, replace: boolean) => {
      const mine = replace ? ++generation.current : generation.current;
      if (!replace) {
        if (loadingMore.current) return;
        loadingMore.current = true;
      }
      try {
        const res = await fetchTrades(
          { page: nextPage, limit: PAGE, chamber: chamber === 'both' ? undefined : [chamber] },
          await authed()
        );
        if (mine !== generation.current) return;
        rememberTrades(res.data);
        // Offset pages over a sort with ties can hand back a row twice.
        setFeed((prev) => {
          if (replace) return res.data;
          const seen = new Set(prev.map((t) => t.id));
          return [...prev, ...res.data.filter((t) => !seen.has(t.id))];
        });
        setPage(res.page);
        setTotalPages(res.totalPages);
        setStatus('ready');
        setError(null);
      } catch (err) {
        if (mine !== generation.current) return;
        setError(err instanceof Error ? err.message : 'Something went wrong.');
        if (replace) setStatus('error');
      } finally {
        if (!replace) loadingMore.current = false;
        setRefreshing(false);
      }
    },
    [chamber, authed]
  );

  useEffect(() => {
    // Every state update in these is behind an await; the rule cannot see that.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRecent();
  }, [loadRecent]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadFeed(1, true);
  }, [loadFeed]);

  const { stories, trending } = useMemo(() => digest(recent ?? []), [recent]);

  const onRefresh = () => {
    setRefreshing(true);
    void loadRecent();
    void loadFeed(1, true);
  };

  const firstName = user?.firstName;

  const browse: { icon: IconName; label: string; hint: string; href: '/issuers' | '/news' }[] = [
    { icon: 'business-outline', label: 'Companies', hint: 'Who holds what', href: '/issuers' },
    { icon: 'newspaper-outline', label: 'News', hint: 'Markets and Washington', href: '/news' },
  ];

  const header = (
    <View>
      <TabHeader
        right={
          user ? (
            <Tap onPress={() => router.push('/sign-in')} scaleTo={0.9} accessibilityLabel="Account" hitSlop={8}>
              <Avatar
                uri={user.imageUrl}
                name={user.fullName ?? user.primaryEmailAddress?.emailAddress ?? 'You'}
                size={34}
              />
            </Tap>
          ) : (
            <IconButton name="person-circle-outline" label="Sign in" onPress={() => router.push('/sign-in')} />
          )
        }
      />

      <View style={styles.hello}>
        <Text variant="callout" tone="muted">
          {greeting()}
          {firstName ? `, ${firstName}` : ''}
        </Text>
        <Text variant="title">What is Congress trading?</Text>
      </View>

      <View style={styles.search}>
        <SearchBar onPress={() => router.push('/search')} />
      </View>

      <View style={styles.block}>
        <SectionHeader title="Just filed" subtitle="Members with new disclosures" />
        {recent === null ? (
          <View style={styles.storiesRow}>
            {Array.from({ length: 5 }, (_, i) => (
              <View key={i} style={styles.story}>
                <Skeleton width={70} height={70} round={35} />
                <Skeleton width={56} height={10} />
              </View>
            ))}
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storiesRow}>
            {stories.map((s) => (
              <Tap
                key={s.slug}
                scaleTo={0.93}
                feedback="tap"
                onPress={() => router.push({ pathname: '/politician/[slug]', params: { slug: s.slug } })}
                style={styles.story}>
                <Avatar uri={s.photo} name={s.name} party={s.party} size={64} ring />
                <Text variant="footnote" numberOfLines={1} style={styles.storyName}>
                  {surname(s.name)}
                </Text>
                <Text variant="footnote" tone="faint" style={styles.storyCount}>
                  {s.count} {s.count === 1 ? 'trade' : 'trades'}
                </Text>
              </Tap>
            ))}
          </ScrollView>
        )}
      </View>

      <View style={styles.inset}>
        <Tap onPress={() => router.push('/swipe')} feedback="commit" scaleTo={0.98}>
          <LinearGradient
            colors={[...brand.hero]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.swipeCard, scheme === 'light' ? shadow.raised : null]}>
            <View style={styles.swipeText}>
              <Text variant="label" color="rgba(255,255,255,0.7)">
                FIND WHO TO FOLLOW
              </Text>
              <Text variant="headline" color="#FFFFFF">
                Swipe through Congress
              </Text>
              <Text variant="callout" color="rgba(255,255,255,0.8)">
                Right to follow, left to pass. Your picks land on your Watchlist.
              </Text>
            </View>
            <View style={styles.swipeIcon}>
              <Icon name="albums" size={30} color="#FFFFFF" />
            </View>
          </LinearGradient>
        </Tap>
      </View>

      <View style={styles.block}>
        <SectionHeader
          title="Trending in Congress"
          subtitle="Most traded in the latest filings"
          action="All"
          onAction={() => router.push('/issuers')}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.trendRow}>
          {recent === null
            ? Array.from({ length: 3 }, (_, i) => (
                <View key={i} style={[styles.trendCard, { backgroundColor: c.surface, borderColor: c.border }]}>
                  <Skeleton width={52} height={52} round={16} />
                  <Skeleton width="60%" height={14} />
                  <Skeleton width="90%" height={10} />
                </View>
              ))
            : trending.map((t) => (
                <Card
                  key={t.ticker}
                  onPress={() => router.push({ pathname: '/issuer/[slug]', params: { slug: t.ticker.toLowerCase() } })}
                  style={styles.trendCard}>
                  <View style={styles.trendTop}>
                    <TickerLogo ticker={t.ticker} size={52} />
                    <Icon name="arrow-forward" size={18} color={c.textFaint} />
                  </View>
                  <View style={styles.trendText}>
                    <Text variant="subhead">{t.ticker}</Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {t.company ?? 'Listed company'}
                    </Text>
                  </View>
                  <Text variant="footnote" tone="muted">
                    {t.count} trades · {t.members} {t.members === 1 ? 'member' : 'members'}
                  </Text>
                  <SentimentBar buys={t.buys} sells={t.sells} showLabels={false} />
                </Card>
              ))}
        </ScrollView>
      </View>

      <View style={[styles.browse, styles.inset]}>
        {browse.map((b) => (
          <Tap
            key={b.label}
            feedback="tap"
            onPress={() => router.push(b.href)}
            style={[styles.browseTile, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={[styles.browseIcon, { backgroundColor: c.accentSoft }]}>
              <Icon name={b.icon} size={20} color={c.accent} />
            </View>
            <View style={styles.flex}>
              <Text variant="bodyStrong">{b.label}</Text>
              <Text variant="footnote" tone="muted" numberOfLines={1}>
                {b.hint}
              </Text>
            </View>
          </Tap>
        ))}
      </View>

      <View style={styles.feedHead}>
        <SectionHeader
          title="Latest trades"
          subtitle="Newest disclosures first"
          action="Filters"
          onAction={() => router.push('/trades')}
        />
        <ChipRow options={CHAMBERS} value={chamber} onChange={setChamber} />
      </View>
      {status === 'loading' && feed.length === 0 ? <RowSkeleton count={6} /> : null}
      {status === 'error' && feed.length === 0 ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn't load trades"
          body={error}
          action="Try again"
          onAction={() => void loadFeed(1, true)}
          compact
        />
      ) : null}
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <FlatList
        data={status === 'ready' || feed.length ? feed : []}
        keyExtractor={(t) => String(t.id)}
        renderItem={({ item }) => <TradeRow trade={item} />}
        ListHeaderComponent={header}
        ListFooterComponent={
          page < totalPages && feed.length ? (
            <View style={styles.footer}>
              <ActivityIndicator />
            </View>
          ) : feed.length ? (
            <View style={styles.footer}>
              <Text variant="caption" tone="faint">
                That is every trade on file.
              </Text>
            </View>
          ) : null
        }
        onEndReached={() => {
          if (status === 'ready' && page < totalPages) void loadFeed(page + 1, false);
        }}
        onEndReachedThreshold={0.8}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.textMuted} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
      />
      {error && feed.length ? (
        <View style={[styles.toast, { backgroundColor: c.primary }]}>
          <Text variant="caption" color={c.primaryText}>
            {error}
          </Text>
          <Button label="Retry" size="md" kind="secondary" onPress={() => void loadFeed(page + 1, false)} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingBottom: 32 },
  hello: { paddingHorizontal: 20, paddingTop: 6, gap: 2 },
  search: { paddingHorizontal: 20, paddingTop: 16 },
  block: { paddingTop: 26, gap: 14 },
  inset: { paddingHorizontal: 20, paddingTop: 26 },
  storiesRow: { paddingHorizontal: 16, gap: 10 },
  story: { width: 78, alignItems: 'center', gap: 6 },
  storyName: { fontWeight: '600', maxWidth: 76 },
  storyCount: { marginTop: -4 },
  swipeCard: { borderRadius: radius.xxl, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 16 },
  swipeText: { flex: 1, gap: 4 },
  swipeIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendRow: { paddingHorizontal: 20, gap: 12, paddingBottom: 8 },
  trendCard: { width: 176, gap: 12, borderRadius: radius.xl, padding: 16, borderWidth: StyleSheet.hairlineWidth },
  trendTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  trendText: { gap: 1 },
  browse: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  browseTile: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  browseIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  feedHead: { paddingTop: 30, gap: 14, paddingBottom: 6 },
  footer: { paddingVertical: 28, alignItems: 'center' },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 12,
    borderRadius: radius.lg,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
});
