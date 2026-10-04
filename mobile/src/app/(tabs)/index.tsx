import { useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { fetchNews, fetchTiming, fetchTrades, type NewsItem, type TimingOverview, type Trade } from '@/lib/api';
import { memberName, surname } from '@/lib/format';
import { rememberTrades } from '@/lib/trade-cache';
import { useAuthedRequest } from '@/lib/use-api';
import { useRefresh } from '@/lib/use-refresh';
import { radius, useTheme } from '@/theme';
import { Avatar, UserAvatar } from '@/ui/avatar';
import { Button, IconButton } from '@/ui/button';
import { Card } from '@/ui/card';
import { ChipRow } from '@/ui/chip-row';
import { Icon } from '@/ui/icon';
import { NewsCard } from '@/ui/news-card';
import { NotAdvice } from '@/ui/not-advice';
import { SearchBar } from '@/ui/search-bar';
import { SectionHeader } from '@/ui/section';
import { SentimentBar } from '@/ui/sentiment-bar';
import { RowSkeleton, Skeleton } from '@/ui/skeleton';
import { TabHeader } from '@/ui/tab-header';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';
import { TickerLogo } from '@/ui/ticker-logo';
import { FeaturedTiming, TimedTradeCard } from '@/ui/timing-feature';
import { TradeRow } from '@/ui/trade-row';

const TIMING_WINDOWS = [
  { key: '30', label: 'Past 30 days' },
  { key: '90', label: 'Past 90 days' },
] as const;
type TimingKey = (typeof TIMING_WINDOWS)[number]['key'];

// How many cards each sideways row shows before "See all".
const ROW = 5;
// How many of the latest trades Discover lists before "See all trades".
const LATEST = 5;

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
 * a row of faces who just did something, the five latest trades as a list,
 * and then rows of cards to scroll sideways, each five long with a "See all"
 * to the full list: the stocks Congress keeps trading, its best recent
 * trades, and the markets news. Nothing here scrolls forever; the Trades tab
 * and News do. The not-financial-advice note closes the page.
 */
export default function DiscoverScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const authed = useAuthedRequest();
  const { user } = useUser();

  const [recent, setRecent] = useState<Trade[] | null | 'failed'>(null);
  // Both windows kept once loaded, so switching back is instant.
  const [timingDays, setTimingDays] = useState<TimingKey>('90');
  const [timing, setTiming] = useState<Partial<Record<TimingKey, TimingOverview>> | null | 'failed'>(null);
  const [news, setNews] = useState<NewsItem[] | null | 'failed'>(null);

  // The latest filings: the trades row, and the faces and trending stocks
  // worked out from them.
  const loadRecent = useCallback(async () => {
    try {
      const res = await fetchTrades({ page: 1, limit: 200 }, await authed());
      rememberTrades(res.data);
      setRecent(res.data);
    } catch {
      setRecent((prev) => (Array.isArray(prev) ? prev : 'failed'));
    }
  }, [authed]);

  // Optional: on failure the section simply does not show.
  const loadTiming = useCallback(
    async (days: TimingKey) => {
      try {
        const overview = await fetchTiming(Number(days) as 30 | 90, await authed());
        rememberTrades(overview.trades);
        setTiming((prev) => ({ ...(prev && prev !== 'failed' ? prev : {}), [days]: overview }));
      } catch {
        setTiming((prev) => (prev && prev !== 'failed' ? prev : 'failed'));
      }
    },
    [authed]
  );

  // The markets desk first, as on the website's home page.
  const loadNews = useCallback(async () => {
    try {
      const sections = await fetchNews();
      const markets = sections.find((s) => s.key === 'cnbc-markets') ?? sections[0];
      setNews(markets ? markets.items.slice(0, ROW) : []);
    } catch {
      setNews((prev) => (Array.isArray(prev) ? prev : 'failed'));
    }
  }, []);

  useEffect(() => {
    // Every state update in these is behind an await; the rule cannot see that.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRecent();
    void loadNews();
  }, [loadRecent, loadNews]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTiming(timingDays);
  }, [loadTiming, timingDays]);

  const trades = useMemo(() => (Array.isArray(recent) ? recent : []), [recent]);
  const { stories, trending } = useMemo(() => digest(trades), [trades]);
  const loading = recent === null;

  const { refreshing, onRefresh } = useRefresh(
    useCallback(
      () => [loadRecent(), loadNews(), loadTiming(timingDays)],
      [loadRecent, loadNews, loadTiming, timingDays]
    )
  );

  const firstName = user?.firstName;
  const shownTiming = timing && timing !== 'failed' ? timing[timingDays] : undefined;

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: c.background }]}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.textMuted} />}>
      <TabHeader
        brand
        right={
          user ? (
            <Tap onPress={() => router.push('/sign-in')} scaleTo={0.9} accessibilityLabel="Account" hitSlop={8}>
              <UserAvatar user={user} size={34} />
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
        {loading ? (
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

      <View style={styles.block}>
        <SectionHeader
          title="Latest trades"
          subtitle="The newest disclosures"
          action="See all"
          onAction={() => router.push('/trades')}
        />
        {recent === 'failed' ? (
          <Tap onPress={() => void loadRecent()} style={styles.retry}>
            <Text variant="callout" tone="muted">
              Couldn&apos;t load the latest trades. Tap to try again.
            </Text>
          </Tap>
        ) : loading ? (
          <RowSkeleton count={5} />
        ) : (
          <View>
            {trades.slice(0, LATEST).map((t, i) => (
              <TradeRow key={t.id} trade={t} divider={i < Math.min(trades.length, LATEST) - 1} />
            ))}
            <View style={styles.inset}>
              <Button
                label="See all trades"
                kind="secondary"
                size="md"
                icon="arrow-forward"
                onPress={() => router.push('/trades')}
              />
            </View>
          </View>
        )}
      </View>

      <View style={styles.block}>
        <SectionHeader
          title="Trending in Congress"
          subtitle="Most traded in the latest filings"
          action="See all"
          onAction={() => router.push('/issuers')}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {loading
            ? Array.from({ length: 3 }, (_, i) => (
                <View key={i} style={[styles.trendCard, { backgroundColor: c.surface, borderColor: c.border }]}>
                  <Skeleton width={52} height={52} round={16} />
                  <Skeleton width="60%" height={14} />
                  <Skeleton width="90%" height={10} />
                </View>
              ))
            : trending.slice(0, ROW).map((t) => (
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
          {!loading && trending.length ? (
            <SeeAllCard label="All companies" onPress={() => router.push('/issuers')} />
          ) : null}
        </ScrollView>
      </View>

      {timing !== 'failed' ? (
        <View style={styles.block}>
          <SectionHeader
            title="Congress's best trades"
            subtitle="What each trade has returned since it was made. Filed on time only."
            action="See all"
            onAction={() => router.push('/timing')}
          />
          <ChipRow options={TIMING_WINDOWS} value={timingDays} onChange={setTimingDays} />
          <View style={styles.inset}>
            {!shownTiming ? (
              <Skeleton width="100%" height={330} round={20} />
            ) : shownTiming.trades[0] ? (
              <FeaturedTiming trade={shownTiming.trades[0]} />
            ) : (
              <Text variant="callout" tone="muted">
                No priced trades were disclosed on time in this window yet.
              </Text>
            )}
          </View>
          {shownTiming && shownTiming.trades.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
              {shownTiming.trades.slice(1, ROW).map((t, i) => (
                <TimedTradeCard key={t.id} trade={t} rank={i + 2} />
              ))}
              <SeeAllCard label="Full ranking" onPress={() => router.push('/timing')} compact />
            </ScrollView>
          ) : null}
        </View>
      ) : null}

      {news !== 'failed' && (news === null || news.length) ? (
        <View style={styles.block}>
          <SectionHeader
            title="News"
            subtitle="Markets and investing, from CNBC"
            action="See all"
            onAction={() => router.push('/news')}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {news === null
              ? Array.from({ length: 2 }, (_, i) => <Skeleton key={i} width={248} height={230} round={20} />)
              : news.map((item) => <NewsCard key={item.url} item={item} />)}
            {news && news.length ? <SeeAllCard label="All news" onPress={() => router.push('/news')} /> : null}
          </ScrollView>
        </View>
      ) : null}

      {/* Once, at the foot of the page, for everything above it. */}
      <View style={[styles.inset, styles.foot]}>
        <NotAdvice />
      </View>
    </ScrollView>
  );
}

/** The last card in a sideways row: the way on to the full list. */
function SeeAllCard({ label, onPress, compact = false }: { label: string; onPress: () => void; compact?: boolean }) {
  const { c } = useTheme();
  return (
    <Tap
      feedback="tap"
      scaleTo={0.95}
      onPress={onPress}
      style={[styles.seeAll, compact && styles.seeAllCompact, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={[styles.seeAllIcon, { backgroundColor: c.accentSoft }]}>
        <Icon name="arrow-forward" size={20} color={c.accent} />
      </View>
      <Text variant="callout" style={styles.bold}>
        {label}
      </Text>
    </Tap>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingBottom: 40 },
  bold: { fontWeight: '700' },
  hello: { paddingHorizontal: 16, paddingTop: 6, gap: 2 },
  search: { paddingHorizontal: 16, paddingTop: 16 },
  block: { paddingTop: 26, gap: 14 },
  inset: { paddingHorizontal: 16 },
  row: { paddingHorizontal: 16, gap: 12, paddingBottom: 4 },
  retry: { paddingHorizontal: 16, paddingVertical: 8 },
  foot: { paddingTop: 28 },
  // Each face is centred in a tile wider than it; this puts the first ring,
  // not the tile, on the page margin.
  storiesRow: { paddingHorizontal: 13, gap: 10 },
  story: { width: 78, alignItems: 'center', gap: 6 },
  storyName: { fontWeight: '600', maxWidth: 76 },
  storyCount: { marginTop: -4 },
  trendCard: { width: 176, gap: 12, borderRadius: radius.xl, padding: 16, borderWidth: StyleSheet.hairlineWidth },
  trendTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  trendText: { gap: 1 },
  seeAll: {
    width: 132,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  seeAllCompact: { width: 120 },
  seeAllIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
