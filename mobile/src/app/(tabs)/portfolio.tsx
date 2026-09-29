import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import {
  fetchIssuers,
  fetchPoliticians,
  type IssuerDetail,
  type IssuerSummary,
  type PoliticianDetail,
  type PoliticianSummary,
} from '@/lib/api';
import { getIssuer, getPolitician } from '@/lib/detail-cache';
import { useFollows, type FollowedMember, type FollowedStock } from '@/lib/follows';
import { filedAgo, memberDisplayNameFromFiledName } from '@/lib/format';
import { useAuthedRequest } from '@/lib/use-api';
import { radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/avatar';
import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { FollowStar } from '@/ui/follow-button';
import { Icon } from '@/ui/icon';
import { SectionHeader } from '@/ui/section';
import { Segmented } from '@/ui/segmented';
import { Skeleton } from '@/ui/skeleton';
import { TabHeader } from '@/ui/tab-header';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';
import { TickerLogo } from '@/ui/ticker-logo';

const VIEWS = [
  { key: 'holdings', label: 'Holdings' },
  { key: 'watchlist', label: 'Watchlist' },
] as const;
type View_ = (typeof VIEWS)[number]['key'];

const RECENT_DAYS = 90;

/**
 * How Congress is leaning on a stock lately: the share of its trades in the
 * last 90 days that were purchases, from the company page's latest trades.
 * Falls back to the all-time split when nothing was filed recently.
 *
 * This takes the place a price change has in a brokerage app. CongTrade has no
 * price feed, and a number that looked like a market move but was not one
 * would be the most misleading thing on the screen.
 */
function lean(detail: IssuerDetail): { share: number; recent: boolean; trades: number } {
  const cutoff = Date.now() - RECENT_DAYS * 86_400_000;
  const recent = detail.trades.filter((t) => t.filing_date && new Date(t.filing_date).getTime() >= cutoff);
  const pool = recent.length >= 3 ? recent : null;
  const buys = pool ? pool.filter((t) => t.transaction_type.startsWith('P')).length : detail.issuer.purchases;
  const sells = pool ? pool.filter((t) => t.transaction_type.startsWith('S')).length : detail.issuer.sales;
  const total = buys + sells;
  return {
    share: total ? buys / total : 0.5,
    recent: Boolean(pool),
    trades: pool ? pool.length : detail.issuer.trade_count,
  };
}

function HoldingRow({
  stock,
  detail,
  last,
}: {
  stock: FollowedStock;
  detail: IssuerDetail | undefined;
  last: boolean;
}) {
  const { c } = useTheme();
  const router = useRouter();
  const name = detail?.issuer.company_name ?? stock.company_name ?? stock.ticker;
  const l = detail ? lean(detail) : null;
  const pct = l ? Math.round(l.share * 100) : null;
  return (
    <Tap
      scaleTo={0.985}
      onPress={() => router.push({ pathname: '/issuer/[slug]', params: { slug: stock.slug } })}
      style={styles.row}>
      <TickerLogo ticker={stock.ticker} size={46} />
      <View
        style={[styles.rowBody, !last && { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        <View style={styles.rowText}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {name} ({stock.ticker})
          </Text>
          {detail ? (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {detail.issuer.trade_count.toLocaleString()} trades · {detail.issuer.politician_count} members
            </Text>
          ) : (
            <Skeleton width={140} height={11} />
          )}
        </View>
        {l && pct !== null ? (
          <View style={styles.lean}>
            <Text variant="subhead" tone={pct >= 50 ? 'gain' : 'loss'}>
              {pct}%
            </Text>
            <Text variant="footnote" tone="faint">
              {l.recent ? 'buys, 90d' : 'buys'}
            </Text>
          </View>
        ) : (
          <Skeleton width={44} height={18} />
        )}
        <Icon name="chevron-forward" size={18} color={c.textFaint} />
      </View>
    </Tap>
  );
}

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
      <Avatar uri={member.photo_url} name={member.name} party={member.party} size={46} />
      <View
        style={[styles.rowBody, !last && { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        <View style={styles.rowText}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {member.name}
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {[member.party, member.subtitle].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View style={styles.lean}>
          {detail ? (
            <>
              <Text variant="bodyStrong">{detail.profile.trade_count.toLocaleString()}</Text>
              <Text variant="footnote" tone="faint">
                {latest ? `filed ${filedAgo(latest.filing_date).toLowerCase()}` : 'trades'}
              </Text>
            </>
          ) : (
            <Skeleton width={44} height={18} />
          )}
        </View>
        <Icon name="chevron-forward" size={18} color={c.textFaint} />
      </View>
    </Tap>
  );
}

/**
 * Portfolio: what this person follows.
 *
 * Holdings are stocks, Watchlist is members, as in the design. Neither is a
 * brokerage position: they are what to keep an eye on, and each row says how
 * Congress is trading it rather than what the market did.
 *
 * Empty, each side offers a few popular choices to follow in one tap and the
 * swipe deck for more, so nobody lands on a blank page with nowhere to go.
 */
export default function PortfolioScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const authed = useAuthedRequest();
  const params = useLocalSearchParams<{ view?: string }>();
  const follows = useFollows();
  const [view, setView] = useState<View_>(params.view === 'watchlist' ? 'watchlist' : 'holdings');
  // Arriving from More with "Watchlist" or "My Portfolio" picks the side. Done
  // while rendering, the way React recommends for state that follows a prop.
  const [lastParam, setLastParam] = useState(params.view);
  if (params.view !== lastParam) {
    setLastParam(params.view);
    if (params.view === 'watchlist' || params.view === 'holdings') setView(params.view);
  }
  const [issuers, setIssuers] = useState<Record<string, IssuerDetail>>({});
  const [members, setMembers] = useState<Record<string, PoliticianDetail>>({});
  const [suggestStocks, setSuggestStocks] = useState<IssuerSummary[]>([]);
  const [suggestMembers, setSuggestMembers] = useState<PoliticianSummary[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (fresh = false) => {
      const options = await authed();
      await Promise.all([
        ...follows.stocks.map((s) =>
          getIssuer(s.slug, options, fresh)
            .then((d) => setIssuers((prev) => ({ ...prev, [s.ticker]: d })))
            .catch(() => {})
        ),
        ...follows.members.map((m) =>
          getPolitician(m.slug, options, fresh)
            .then((d) => setMembers((prev) => ({ ...prev, [m.slug]: d })))
            .catch(() => {})
        ),
      ]);
      setRefreshing(false);
    },
    [authed, follows.stocks, follows.members]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const options = await authed();
        const [s, m] = await Promise.all([
          fetchIssuers({ limit: 8, sort: 'politician_count' }, options),
          fetchPoliticians({ limit: 8, sort: 'trade_count' }, options),
        ]);
        if (cancelled) return;
        setSuggestStocks(s.data);
        setSuggestMembers(m.data);
      } catch {
        // Suggestions are a nicety; an empty state without them still works.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed]);

  const holdings = view === 'holdings';
  const list = holdings ? follows.stocks : follows.members;

  const suggestions = (
    <View style={styles.suggest}>
      <SectionHeader
        title={list.length ? 'Suggested for you' : holdings ? 'Popular in Congress' : 'Most active traders'}
        subtitle="Tap the star to follow"
        inset={4}
      />
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        {holdings
          ? suggestStocks
              .filter((s) => !follows.isFollowingStock(s.ticker) || !list.length)
              .map((s, i, shown) => (
                <Tap
                  key={s.ticker}
                  scaleTo={0.985}
                  onPress={() => router.push({ pathname: '/issuer/[slug]', params: { slug: s.slug } })}
                  style={styles.row}>
                  <TickerLogo ticker={s.ticker} size={42} />
                  <View
                    style={[
                      styles.rowBody,
                      i < shown.length - 1 && {
                        borderBottomColor: c.border,
                        borderBottomWidth: StyleSheet.hairlineWidth,
                      },
                    ]}>
                    <View style={styles.rowText}>
                      <Text variant="bodyStrong" numberOfLines={1}>
                        {s.ticker}
                      </Text>
                      <Text variant="caption" tone="muted" numberOfLines={1}>
                        {s.company_name} · {s.politician_count} members
                      </Text>
                    </View>
                    <FollowStar
                      following={follows.isFollowingStock(s.ticker)}
                      onPress={() =>
                        follows.toggleStock({ ticker: s.ticker, slug: s.slug, company_name: s.company_name })
                      }
                    />
                  </View>
                </Tap>
              ))
          : suggestMembers
              .filter((m) => !follows.isFollowingMember(m.slug) || !list.length)
              .map((m, i, shown) => {
                const name = memberDisplayNameFromFiledName(m.member_name);
                const subtitle = [
                  m.chamber === 'senate' ? m.member_state : m.state_district,
                  m.chamber === 'senate' ? 'Senate' : 'House',
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <Tap
                    key={m.slug}
                    scaleTo={0.985}
                    onPress={() => router.push({ pathname: '/politician/[slug]', params: { slug: m.slug } })}
                    style={styles.row}>
                    <Avatar uri={m.photo_url} name={name} party={m.party} size={42} />
                    <View
                      style={[
                        styles.rowBody,
                        i < shown.length - 1 && {
                          borderBottomColor: c.border,
                          borderBottomWidth: StyleSheet.hairlineWidth,
                        },
                      ]}>
                      <View style={styles.rowText}>
                        <Text variant="bodyStrong" numberOfLines={1}>
                          {name}
                        </Text>
                        <Text variant="caption" tone="muted" numberOfLines={1}>
                          {subtitle} · {m.trade_count.toLocaleString()} trades
                        </Text>
                      </View>
                      <FollowStar
                        following={follows.isFollowingMember(m.slug)}
                        onPress={() =>
                          follows.toggleMember({ slug: m.slug, name, photo_url: m.photo_url, party: m.party, subtitle })
                        }
                      />
                    </View>
                  </Tap>
                );
              })}
      </View>
      <Button label="Swipe to find more" icon="albums-outline" kind="secondary" onPress={() => router.push('/swipe')} />
    </View>
  );

  const header = (
    <View>
      <TabHeader title="My Portfolio" subtitle="Track the trades you're interested in." />
      <View style={styles.segment}>
        <Segmented options={VIEWS} value={view} onChange={setView} />
      </View>
      {list.length ? (
        <Text variant="footnote" tone="faint" style={styles.count}>
          {holdings
            ? `${list.length} ${list.length === 1 ? 'stock' : 'stocks'} · % is the share of Congress trades that were buys`
            : `${list.length} ${list.length === 1 ? 'member' : 'members'} followed`}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <FlatList
        data={[0]}
        keyExtractor={() => view}
        renderItem={() =>
          list.length === 0 ? (
            <View>
              <EmptyState
                icon={holdings ? 'trending-up-outline' : 'people-outline'}
                title={holdings ? 'No stocks yet' : 'Nobody on your watchlist'}
                body={
                  holdings
                    ? 'Follow a stock and every trade Congress makes in it shows up here and in Alerts.'
                    : 'Follow members to see every trade they disclose, the day it is filed.'
                }
                compact
              />
              {suggestions}
            </View>
          ) : (
            <View style={styles.inset}>
              <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
                {holdings
                  ? follows.stocks.map((s, i) => (
                      <HoldingRow
                        key={s.ticker}
                        stock={s}
                        detail={issuers[s.ticker]}
                        last={i === follows.stocks.length - 1}
                      />
                    ))
                  : follows.members.map((m, i) => (
                      <WatchRow
                        key={m.slug}
                        member={m}
                        detail={members[m.slug]}
                        last={i === follows.members.length - 1}
                      />
                    ))}
              </View>
              <Button
                label={holdings ? 'Add stocks' : 'Add members'}
                icon="add"
                kind="secondary"
                onPress={() => router.push(holdings ? '/issuers' : '/politicians')}
                style={styles.add}
              />
              {/* A short list keeps suggesting, the way a new account is shown
                  who to follow until it has enough of its own. */}
              {list.length < 5 ? <View style={styles.more}>{suggestions}</View> : null}
            </View>
          )
        }
        ListHeaderComponent={header}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(true);
            }}
            tintColor={c.textMuted}
          />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingBottom: 40 },
  segment: { paddingHorizontal: 20, paddingTop: 20 },
  count: { paddingHorizontal: 22, paddingTop: 12 },
  inset: { paddingHorizontal: 16, paddingTop: 12, gap: 14 },
  card: { borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 16 },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16, paddingRight: 14 },
  rowText: { flex: 1, gap: 3 },
  lean: { alignItems: 'flex-end', gap: 1 },
  suggest: { gap: 14, paddingHorizontal: 16 },
  add: { marginTop: 2 },
  more: { marginTop: 18, marginHorizontal: -16 },
});
