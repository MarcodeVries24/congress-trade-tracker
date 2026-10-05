import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { TimedTrade, TimingLeader } from '@/lib/api';
import { amountLabel, assetLabel, memberName, shortDate, surname, tradeVerb } from '@/lib/format';
import { dayOffset, fetchPriceSeries, formatMove, type PricePoint } from '@/lib/prices';
import { rememberTrades } from '@/lib/trade-cache';
import { radius, shadow, useTheme } from '@/theme';
import { Avatar } from '@/ui/avatar';
import { PriceChart } from '@/ui/price-chart';
import { Skeleton } from '@/ui/skeleton';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';
import { TickerLogo } from '@/ui/ticker-logo';

/**
 * Congress's best trades, as Discover and the ranking screen show them: the
 * best trade as a card with its chart, the runners-up, and the members whose
 * trades do best. Every figure is the stock's move since the trade in the
 * trader's favour: the rise since a purchase, the fall since a sale. The data
 * is /api/timing, the same as the website's.
 */

const MARGIN_DAYS = 30;

function daysLabel(days: number | null): string {
  if (days === null) return '';
  if (days >= 365) return `${days.toLocaleString()} days (${(days / 365).toFixed(1)} years)`;
  return `${days} ${days === 1 ? 'day' : 'days'}`;
}

function sinceLabel(type: string): string {
  return /^P/i.test(type) ? 'since bought' : 'since sold';
}

function useOpenTrade() {
  const router = useRouter();
  return (t: TimedTrade) => {
    rememberTrades([t]);
    router.push({ pathname: '/trade/[id]', params: { id: String(t.id) } });
  };
}

export function FeaturedTiming({ trade: t }: { trade: TimedTrade }) {
  const { c, scheme } = useTheme();
  const open = useOpenTrade();
  const [points, setPoints] = useState<PricePoint[] | null | undefined>(undefined);
  const traded = t.transaction_date;
  const filed = t.filing_date;

  // From a month before the trade to the latest close: the whole run since.
  useEffect(() => {
    if (!t.ticker || !traded) return;
    let live = true;
    void fetchPriceSeries(t.ticker, dayOffset(traded, -MARGIN_DAYS)).then((p) => live && setPoints(p));
    return () => {
      live = false;
    };
  }, [t.ticker, traded]);

  const name = memberName(t);
  const buy = /^P/i.test(t.transaction_type);
  const late = t.days_to_file !== null && t.days_to_file > 45;

  return (
    <Tap
      feedback="tap"
      scaleTo={0.98}
      onPress={() => open(t)}
      style={[styles.featured, { backgroundColor: c.surface, borderColor: c.border }, scheme === 'light' ? shadow.card : null]}>
      <View style={styles.featuredHead}>
        <Avatar uri={t.photo_url} name={name} party={t.party} size={44} />
        <View style={styles.flex}>
          <Text variant="label" tone="accent">
            BEST TRADE
          </Text>
          <Text variant="bodyStrong" numberOfLines={2}>
            {name} {tradeVerb(t.transaction_type).toLowerCase()} {t.ticker ?? assetLabel(t)}
          </Text>
          <Text variant="footnote" tone="faint">
            {amountLabel(t.amount_range)} · traded {shortDate(traded)}
          </Text>
        </View>
        {t.ticker ? <TickerLogo ticker={t.ticker} logo={t.logo_url} size={40} /> : null}
      </View>

      <View style={styles.featuredFigure}>
        <View style={styles.figureRow}>
          <Text variant="display" tone="gain">
            {formatMove(t.edge)}
          </Text>
          <Text variant="caption" tone="muted" style={styles.figureNote}>
            {buy ? 'since they bought' : 'since they sold'}
          </Text>
        </View>
        <Text variant="callout" tone="muted">
          The stock has {buy ? 'risen' : 'fallen'} {formatMove(t.edge).replace('+', '')} since the day of the{' '}
          {buy ? 'purchase' : 'sale'}.
          {t.edge_before !== null && t.days_to_file
            ? ` When it was disclosed, ${daysLabel(t.days_to_file)} later, it ${
                t.edge_before >= 0
                  ? `had already moved ${formatMove(t.edge_before).replace('+', '')} their way`
                  : `was still ${formatMove(t.edge_before).replace('−', '')} against them`
              }.`
            : ''}
        </Text>
      </View>

      {points === undefined ? (
        <Skeleton width="100%" height={150} round={12} />
      ) : points && points.length > 4 && traded ? (
        <PriceChart
          points={points}
          height={150}
          window={filed ? { from: traded, to: filed, late } : null}
          markers={[
            { day: traded, kind: buy ? 'buy' : 'sell', label: buy ? 'Bought' : 'Sold' },
            ...(filed ? [{ day: filed, kind: 'filed' as const, label: 'Disclosed' }] : []),
          ]}
        />
      ) : null}
    </Tap>
  );
}

/** A runner-up, as a small card for a horizontal row. */
export function TimedTradeCard({ trade: t, rank }: { trade: TimedTrade; rank: number }) {
  const { c } = useTheme();
  const open = useOpenTrade();
  return (
    <Tap
      feedback="tap"
      scaleTo={0.96}
      onPress={() => open(t)}
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.cardTop}>
        {t.ticker ? <TickerLogo ticker={t.ticker} logo={t.logo_url} size={36} /> : <View style={styles.logoGap} />}
        <Text variant="footnote" tone="faint">
          #{rank}
        </Text>
      </View>
      <Text variant="headline" tone="gain">
        {formatMove(t.edge)}
      </Text>
      <Text variant="footnote" numberOfLines={2} style={styles.cardName}>
        {surname(memberName(t))} {tradeVerb(t.transaction_type).toLowerCase()} {t.ticker ?? assetLabel(t)}
      </Text>
      <Text variant="footnote" tone="faint" numberOfLines={1}>
        {sinceLabel(t.transaction_type)} {shortDate(t.transaction_date)}
      </Text>
    </Tap>
  );
}

/** A ranked trade as a full-width row, for the ranking screen. */
export function TimedTradeRow({ trade: t, rank, divider }: { trade: TimedTrade; rank: number; divider: boolean }) {
  const { c } = useTheme();
  const open = useOpenTrade();
  return (
    <Tap
      scaleTo={0.985}
      onPress={() => open(t)}
      style={[styles.row, divider && { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Text variant="footnote" tone="faint" style={styles.rank}>
        {rank}
      </Text>
      <TickerLogo ticker={t.ticker ?? assetLabel(t)} logo={t.logo_url} size={40} />
      <View style={styles.flex}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {memberName(t)}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {tradeVerb(t.transaction_type)} {t.ticker ?? assetLabel(t)} · {amountLabel(t.amount_range)}
        </Text>
        <Text variant="footnote" tone="faint">
          traded {shortDate(t.transaction_date)}
        </Text>
      </View>
      <View style={styles.right}>
        <Text variant="bodyStrong" tone="gain">
          {formatMove(t.edge)}
        </Text>
        <Text variant="footnote" tone="faint">
          {sinceLabel(t.transaction_type)}
        </Text>
      </View>
    </Tap>
  );
}

export function LeaderRow({ leader: l, rank, divider }: { leader: TimingLeader; rank: number; divider: boolean }) {
  const { c } = useTheme();
  const router = useRouter();
  return (
    <Tap
      scaleTo={0.985}
      onPress={() => router.push({ pathname: '/politician/[slug]', params: { slug: l.slug } })}
      style={[styles.row, divider && { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Text variant="footnote" tone="faint" style={styles.rank}>
        {rank}
      </Text>
      <Avatar uri={l.photo_url} name={l.display} party={l.party} size={40} />
      <View style={styles.flex}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {l.display}
        </Text>
        <Text variant="caption" tone="muted">
          {l.theirWay} of {l.trades} trades went their way
        </Text>
      </View>
      <View style={styles.right}>
        <Text variant="bodyStrong" tone={l.averageEdge >= 0 ? 'gain' : 'loss'}>
          {formatMove(l.averageEdge)}
        </Text>
        <Text variant="footnote" tone="faint">
          average
        </Text>
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 1 },
  featured: { borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 14 },
  featuredHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  featuredFigure: { gap: 2 },
  figureRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  figureNote: { fontWeight: '600' },
  card: { width: 150, padding: 12, gap: 4, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  cardName: { fontWeight: '600' },
  logoGap: { width: 36, height: 36 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rank: { width: 18, textAlign: 'right' },
  right: { alignItems: 'flex-end' },
});
