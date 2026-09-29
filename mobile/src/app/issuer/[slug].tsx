import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, SectionList, StyleSheet, View } from 'react-native';

import type { IssuerDetail } from '@/lib/api';
import { getIssuer } from '@/lib/detail-cache';
import { tradesFromIssuer } from '@/lib/detail-trades';
import { useFollows } from '@/lib/follows';
import { compactUSD, memberDisplayNameFromFiledName, shortDate } from '@/lib/format';
import { byMonth } from '@/lib/group';
import { rememberTrades } from '@/lib/trade-cache';
import { useAuthedRequest } from '@/lib/use-api';
import { radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/avatar';
import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { FollowButton } from '@/ui/follow-button';
import { SentimentBar } from '@/ui/sentiment-bar';
import { RowSkeleton, Skeleton } from '@/ui/skeleton';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';
import { TickerLogo } from '@/ui/ticker-logo';
import { TradeRow } from '@/ui/trade-row';

const RECENT_DAYS = 90;

/**
 * One company: how much Congress has traded it, which way it is leaning, who
 * traded it, and the latest trades by month.
 *
 * The traders row is the way across to a member, which is how people actually
 * explore this: from a stock to who holds it, and from them to what else.
 */
export default function IssuerScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { c } = useTheme();
  const router = useRouter();
  const authed = useAuthedRequest();
  const follows = useFollows();
  const [detail, setDetail] = useState<IssuerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (fresh = false) => {
      try {
        setDetail(await getIssuer(slug, await authed(), fresh));
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      } finally {
        setRefreshing(false);
      }
    },
    [slug, authed]
  );

  useEffect(() => {
    // Every state update in load is behind an await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const trades = useMemo(() => (detail ? tradesFromIssuer(detail) : []), [detail]);
  useEffect(() => rememberTrades(trades), [trades]);
  const sections = useMemo(() => byMonth(trades), [trades]);

  // Read once per visit: the clock is not something to consult during render.
  const [now] = useState(() => Date.now());
  const recent = useMemo(() => {
    const cutoff = now - RECENT_DAYS * 86_400_000;
    const rows = trades.filter((t) => t.filing_date && new Date(t.filing_date).getTime() >= cutoff);
    return {
      buys: rows.filter((t) => t.transaction_type.startsWith('P')).length,
      sells: rows.filter((t) => t.transaction_type.startsWith('S')).length,
    };
  }, [trades, now]);

  if (!detail) {
    return (
      <View style={[styles.screen, { backgroundColor: c.background }]}>
        {error ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load this company"
            body={error}
            action="Try again"
            onAction={() => void load(true)}
          />
        ) : (
          <View style={styles.loading}>
            <Skeleton width={96} height={96} round={28} />
            <Skeleton width={120} height={24} />
            <Skeleton width={180} height={14} />
            <RowSkeleton count={5} />
          </View>
        )}
      </View>
    );
  }

  const i = detail.issuer;
  const following = follows.isFollowingStock(i.ticker);

  const header = (
    <View>
      <View style={styles.hero}>
        <TickerLogo ticker={i.ticker} size={96} />
        <Text variant="title" style={styles.center}>
          {i.ticker}
        </Text>
        <Text variant="callout" tone="muted" style={styles.center}>
          {i.company_name ?? 'Listed company'}
          {i.market_cap ? ` · ${compactUSD(i.market_cap)} market cap` : ''}
        </Text>
        <View style={styles.actions}>
          <View style={styles.flex}>
            <FollowButton
              following={following}
              onPress={() => follows.toggleStock({ ticker: i.ticker, slug: i.slug, company_name: i.company_name })}
            />
          </View>
          <View style={styles.flex}>
            <Button
              label="Email alert"
              icon="notifications-outline"
              kind="secondary"
              size="md"
              onPress={() =>
                router.push({
                  pathname: '/alert/[id]',
                  params: { id: 'new', tickers: i.ticker, name: `Congress trading ${i.ticker}` },
                })
              }
              style={styles.alertButton}
            />
          </View>
        </View>
      </View>

      <View style={[styles.stats, { backgroundColor: c.surface, borderColor: c.border }]}>
        {[
          { v: i.trade_count.toLocaleString(), l: 'Trades' },
          { v: i.politician_count.toLocaleString(), l: 'Members' },
          { v: compactUSD(i.volume_sum), l: 'Est. volume' },
        ].map((s, idx) => (
          <View
            key={s.l}
            style={[
              styles.statCell,
              idx > 0 && { borderLeftColor: c.border, borderLeftWidth: StyleSheet.hairlineWidth },
            ]}>
            <Text variant="subhead" numberOfLines={1} adjustsFontSizeToFit>
              {s.v}
            </Text>
            <Text variant="footnote" tone="muted">
              {s.l}
            </Text>
          </View>
        ))}
      </View>

      <View style={[styles.lean, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Text variant="subhead">How Congress is leaning</Text>
        <View style={styles.leanBlock}>
          <Text variant="caption" tone="muted">
            Filed in the last {RECENT_DAYS} days
          </Text>
          {recent.buys + recent.sells ? (
            <SentimentBar buys={recent.buys} sells={recent.sells} />
          ) : (
            <Text variant="caption" tone="faint">
              No trades filed in this window.
            </Text>
          )}
        </View>
        <View style={styles.leanBlock}>
          <Text variant="caption" tone="muted">
            All time
          </Text>
          <SentimentBar buys={i.purchases} sells={i.sales} />
        </View>
        <Text variant="footnote" tone="faint">
          Last traded {shortDate(i.last_traded)} · last disclosed {shortDate(i.last_filed)}
        </Text>
      </View>

      {detail.traders.length ? (
        <View style={styles.block}>
          <Text variant="headline" style={styles.blockTitle}>
            Who traded it
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.traders}>
            {detail.traders.map((t) => (
              <Tap
                key={t.slug ?? t.member_name}
                disabled={!t.slug}
                feedback="tap"
                scaleTo={0.93}
                onPress={() => t.slug && router.push({ pathname: '/politician/[slug]', params: { slug: t.slug } })}
                style={styles.trader}>
                <Avatar
                  uri={t.photo_url}
                  name={t.display || memberDisplayNameFromFiledName(t.member_name)}
                  party={t.party}
                  size={60}
                  ring
                />
                <Text variant="footnote" numberOfLines={1} style={styles.traderName}>
                  {(t.display || memberDisplayNameFromFiledName(t.member_name)).split(' ').slice(-1)[0]}
                </Text>
                <Text variant="footnote" tone="faint" style={styles.traderCount}>
                  {t.trade_count} {t.trade_count === 1 ? 'trade' : 'trades'}
                </Text>
              </Tap>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.block}>
        <Text variant="headline" style={styles.blockTitle}>
          {trades.length < i.trade_count ? `Latest ${trades.length} trades` : 'Trades'}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <SectionList
        sections={sections}
        keyExtractor={(t) => String(t.id)}
        renderItem={({ item, index, section }) => <TradeRow trade={item} divider={index < section.data.length - 1} />}
        renderSectionHeader={({ section }) => (
          <View style={[styles.month, { backgroundColor: c.background }]}>
            <Text variant="label" tone="faint">
              {section.title.toUpperCase()}
            </Text>
          </View>
        )}
        stickySectionHeadersEnabled={false}
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
  list: { paddingBottom: 48 },
  loading: { alignItems: 'center', gap: 12, paddingTop: 24 },
  hero: { alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingTop: 4 },
  center: { textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14, alignSelf: 'stretch' },
  flex: { flex: 1 },
  alertButton: { height: 42, borderRadius: radius.pill },
  stats: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 22,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
  },
  statCell: { flex: 1, alignItems: 'center', gap: 2, paddingHorizontal: 4 },
  lean: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    gap: 14,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  leanBlock: { gap: 6 },
  block: { paddingTop: 26, gap: 12 },
  blockTitle: { paddingHorizontal: 20 },
  traders: { paddingHorizontal: 16, gap: 8 },
  trader: { width: 76, alignItems: 'center', gap: 6 },
  traderName: { fontWeight: '600', maxWidth: 74 },
  traderCount: { marginTop: -4 },
  month: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 2 },
});
