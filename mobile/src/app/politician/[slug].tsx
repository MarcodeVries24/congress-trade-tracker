import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, SectionList, StyleSheet, View } from 'react-native';

import type { PoliticianDetail } from '@/lib/api';
import { getPolitician } from '@/lib/detail-cache';
import { tradesFromPolitician } from '@/lib/detail-trades';
import { useFollows } from '@/lib/follows';
import { compactUSD, shortDate } from '@/lib/format';
import { byMonth } from '@/lib/group';
import { rememberTrades } from '@/lib/trade-cache';
import { useAuthedRequest } from '@/lib/use-api';
import { partyTone, radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/avatar';
import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { FollowButton } from '@/ui/follow-button';
import { RowSkeleton, Skeleton } from '@/ui/skeleton';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';
import { TickerLogo } from '@/ui/ticker-logo';
import { TimingCard } from '@/ui/timing-card';
import { TradeRow } from '@/ui/trade-row';

/**
 * One member, as a profile: face, name and role, a follow button, the numbers
 * that matter, how their stocks moved before the public knew, what they
 * trade most, and every recent trade grouped by the
 * month it was filed.
 *
 * The same data as the website's member page, from the same function, so the
 * totals match to the trade.
 */
export default function PoliticianScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { c } = useTheme();
  const router = useRouter();
  const authed = useAuthedRequest();
  const follows = useFollows();
  const [detail, setDetail] = useState<PoliticianDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (fresh = false) => {
      try {
        setDetail(await getPolitician(slug, await authed(), fresh));
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

  const trades = useMemo(() => (detail ? tradesFromPolitician(detail) : []), [detail]);
  useEffect(() => rememberTrades(trades), [trades]);
  const sections = useMemo(() => byMonth(trades), [trades]);

  if (!detail) {
    return (
      <View style={[styles.screen, { backgroundColor: c.background }]}>
        {error ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load this member"
            body={error}
            action="Try again"
            onAction={() => void load(true)}
          />
        ) : (
          <View style={styles.loading}>
            <Skeleton width={104} height={104} round={52} />
            <Skeleton width={180} height={22} />
            <Skeleton width={140} height={14} />
            <RowSkeleton count={5} />
          </View>
        )}
      </View>
    );
  }

  const p = detail.profile;
  const where = p.chamber === 'senate' ? p.state : (p.state_district ?? p.state);
  const role = p.chamber === 'senate' ? 'Senator' : p.chamber === 'house' ? 'Representative' : 'Member';
  const following = follows.isFollowingMember(p.slug);
  const subtitle = [where, p.chamber === 'senate' ? 'Senate' : 'House'].filter(Boolean).join(' · ');

  const header = (
    <View>
      <View style={styles.hero}>
        <Avatar uri={p.photo_url} name={p.display} party={p.party} size={104} ring />
        <Text variant="title" style={styles.center}>
          {p.display}
        </Text>
        <View style={styles.roleRow}>
          <View style={[styles.partyDot, { backgroundColor: partyTone(p.party) }]} />
          <Text variant="callout" tone="muted">
            {[role, where, p.party].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View style={styles.actions}>
          <View style={styles.flex}>
            <FollowButton
              following={following}
              onPress={() =>
                follows.toggleMember({
                  slug: p.slug,
                  name: p.display,
                  photo_url: p.photo_url,
                  party: p.party,
                  subtitle,
                })
              }
            />
          </View>
          <View style={styles.flex}>
            <Button
              label="Get alerts"
              icon="notifications-outline"
              kind="secondary"
              size="md"
              onPress={() =>
                router.push({
                  pathname: '/alert/[id]',
                  params: { id: 'new', members: p.names.join('|'), name: `Trades by ${p.display}` },
                })
              }
              style={styles.alertButton}
            />
          </View>
        </View>
      </View>

      <View style={[styles.stats, { backgroundColor: c.surface, borderColor: c.border }]}>
        {[
          { v: p.trade_count.toLocaleString(), l: 'Trades' },
          { v: compactUSD(p.volume_sum), l: 'Est. volume' },
          { v: p.purchases.toLocaleString(), l: 'Bought', tone: c.gain },
          { v: p.sales.toLocaleString(), l: 'Sold', tone: c.loss },
        ].map((s, i) => (
          <View
            key={s.l}
            style={[
              styles.statCell,
              i > 0 && { borderLeftColor: c.border, borderLeftWidth: StyleSheet.hairlineWidth },
            ]}>
            <Text variant="subhead" color={s.tone} numberOfLines={1} adjustsFontSizeToFit>
              {s.v}
            </Text>
            <Text variant="footnote" tone="muted">
              {s.l}
            </Text>
          </View>
        ))}
      </View>
      <Text variant="footnote" tone="faint" style={styles.note}>
        Filing since {shortDate(p.first_filed)}, most recently {shortDate(p.last_filed)}. Volume is estimated from the
        midpoints of the disclosed ranges.
      </Text>

      {detail.timing && detail.timing.priced >= 3 ? (
        <View style={styles.timing}>
          <TimingCard timing={detail.timing} />
        </View>
      ) : null}

      {p.top_tickers.length ? (
        <View style={styles.block}>
          <Text variant="headline" style={styles.blockTitle}>
            Trades most
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tickers}>
            {p.top_tickers.map((t) => (
              <Tap
                key={t.ticker}
                feedback="tap"
                scaleTo={0.94}
                onPress={() => router.push({ pathname: '/issuer/[slug]', params: { slug: t.ticker.toLowerCase() } })}
                style={[styles.tickerCard, { backgroundColor: c.surface, borderColor: c.border }]}>
                <TickerLogo ticker={t.ticker} size={40} />
                <View>
                  <Text variant="bodyStrong">{t.ticker}</Text>
                  <Text variant="footnote" tone="muted">
                    {t.count} {t.count === 1 ? 'trade' : 'trades'}
                  </Text>
                </View>
              </Tap>
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View style={styles.block}>
        <View style={styles.blockRow}>
          <Text variant="headline" style={styles.blockTitle}>
            {trades.length < p.trade_count ? `Latest ${trades.length} trades` : 'Trades'}
          </Text>
          <Tap
            hitSlop={8}
            onPress={() =>
              router.push({ pathname: '/trades', params: { filters: JSON.stringify({ members: p.names }) } })
            }>
            <Text variant="callout" style={styles.seeAll}>
              {trades.length < p.trade_count ? `See all ${p.trade_count.toLocaleString()}` : 'Filter'}
            </Text>
          </Tap>
        </View>
      </View>
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <SectionList
        sections={sections}
        keyExtractor={(t) => String(t.id)}
        renderItem={({ item, index, section }) => (
          <TradeRow trade={item} lead="asset" divider={index < section.data.length - 1} />
        )}
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
  hero: { alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingTop: 4 },
  center: { textAlign: 'center', marginTop: 6 },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  partyDot: { width: 10, height: 10, borderRadius: 5 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12, alignSelf: 'stretch' },
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
  note: { paddingHorizontal: 22, paddingTop: 10 },
  timing: { marginHorizontal: 16, marginTop: 16 },
  block: { paddingTop: 26, gap: 12 },
  blockTitle: { paddingHorizontal: 20 },
  blockRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingRight: 20 },
  seeAll: { fontWeight: '700', textDecorationLine: 'underline' },
  tickers: { paddingHorizontal: 16, gap: 10 },
  tickerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 16,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  month: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 2 },
});
