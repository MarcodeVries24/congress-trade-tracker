import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Trade } from '@/lib/api';
import { shortDate } from '@/lib/format';
import {
  dayOffset,
  fetchPriceSeries,
  formatMove,
  formatPrice,
  inTheirFavour,
  moveBeforeDisclosure,
  moveSinceDisclosure,
  moveSinceTrade,
  today,
  type PricePoint,
} from '@/lib/prices';
import { radius, useTheme } from '@/theme';
import { Pill } from '@/ui/pill';
import { PriceChart } from '@/ui/price-chart';
import { Segmented } from '@/ui/segmented';
import { Skeleton } from '@/ui/skeleton';
import { NotAdvice } from '@/ui/not-advice';
import { Text } from '@/ui/text';

const DEADLINE_DAYS = 45;
// Padding either side of the trade-to-disclosure window in the close-up view.
const MARGIN_DAYS = 30;

type Range = 'around' | 'today';

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000);
}

/**
 * What the stock did around one trade: while only the member knew, and since.
 *
 * The headline number is the move between the trade and its disclosure, the
 * stretch the STOCK Act exists to keep short, with whether it went the way
 * the trade bet. Under it, the price with that stretch shaded, and the two
 * moves anyone else could have had: from the day it was published, and from
 * the trade itself to now.
 *
 * Drawn only when there is something to show: an asset with a ticker that the
 * price source knows.
 */
export function TradePriceCard({ trade }: { trade: Trade }) {
  const { c } = useTheme();
  const before = moveBeforeDisclosure(trade);
  const since = moveSinceDisclosure(trade);
  const overall = moveSinceTrade(trade);
  const traded = trade.transaction_date;
  const filed = trade.filing_date;
  const priced = Boolean(trade.ticker && traded && (before !== null || overall !== null));

  const [points, setPoints] = useState<PricePoint[] | null | undefined>(undefined);
  useEffect(() => {
    if (!priced || !trade.ticker || !traded) return;
    let live = true;
    void fetchPriceSeries(trade.ticker, dayOffset(traded, -MARGIN_DAYS)).then((p) => live && setPoints(p));
    return () => {
      live = false;
    };
  }, [priced, trade.ticker, traded]);

  // The close-up is the default for an old trade, where "to today" would
  // squeeze the weeks that matter into a sliver.
  const [range, setRange] = useState<Range>(() =>
    traded && daysBetween(traded, today()) > 400 ? 'around' : 'today'
  );
  const aroundEnd = filed ? dayOffset(filed, MARGIN_DAYS) : null;
  const shown = useMemo(() => {
    if (!points) return null;
    return range === 'around' && aroundEnd ? points.filter((p) => p.d <= aroundEnd) : points;
  }, [points, range, aroundEnd]);
  // Worth offering both only when "to today" runs well past the close-up.
  const canToggle = Boolean(points && aroundEnd && points.filter((p) => p.d > aroundEnd).length > 20);

  if (!priced || !traded) return null;

  const buy = /^P/i.test(trade.transaction_type);
  const verdict = inTheirFavour(trade.transaction_type, before);
  const gap = filed ? daysBetween(traded, filed) : null;
  const late = gap !== null && gap > DEADLINE_DAYS;
  const sameDay = gap === 0;

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.head}>
        <Text variant="subhead">Before the public knew</Text>
        {verdict !== null && !sameDay ? (
          <Pill label={verdict ? 'Went their way' : 'Went against them'} tone={verdict ? 'gain' : 'loss'} solid={false} />
        ) : null}
      </View>

      {before !== null && !sameDay ? (
        <View style={styles.hero}>
          <Text variant="display" tone={before >= 0 ? 'gain' : 'loss'}>
            {formatMove(before)}
          </Text>
          <Text variant="callout" tone="muted">
            From {formatPrice(trade.price_at_trade!)} when {buy ? 'they bought' : /^S/i.test(trade.transaction_type) ? 'they sold' : 'it was traded'} on {shortDate(traded)}{' '}
            to {formatPrice(trade.price_at_filing!)} when it was disclosed
            {gap !== null ? `, ${gap} ${gap === 1 ? 'day' : 'days'} later` : ''}.
            {late ? ` That is past the ${DEADLINE_DAYS} days the law allows.` : ''}
          </Text>
        </View>
      ) : sameDay ? (
        <Text variant="callout" tone="muted">
          Disclosed the same day it was made, so there was no stretch only the member knew about.
        </Text>
      ) : null}

      {canToggle ? (
        <Segmented
          options={[
            { key: 'around', label: 'Around the trade' },
            { key: 'today', label: 'To today' },
          ]}
          value={range}
          onChange={setRange}
        />
      ) : null}

      {points === undefined ? (
        <Skeleton width="100%" height={180} round={12} />
      ) : shown && shown.length > 1 ? (
        <PriceChart
          points={shown}
          height={180}
          window={filed && !sameDay ? { from: traded, to: filed, late } : null}
          markers={[
            { day: traded, kind: buy ? 'buy' : 'sell', label: buy ? 'Bought' : 'Sold' },
            ...(filed ? [{ day: filed, kind: 'filed' as const, label: 'Disclosed' }] : []),
          ]}
          idle={
            <Text variant="footnote" tone="faint">
              Drag along the chart to read the price on any day.
            </Text>
          }
        />
      ) : null}

      <View style={[styles.stats, { borderTopColor: c.border }]}>
        <View style={styles.stat}>
          <Text variant="caption" tone="muted">
            Since disclosure
          </Text>
          <Text variant="headline" tone={since === null ? 'muted' : since >= 0 ? 'gain' : 'loss'}>
            {since === null ? '—' : formatMove(since)}
          </Text>
          <Text variant="footnote" tone="faint">
            {trade.price_at_filing != null ? `from ${formatPrice(trade.price_at_filing)}` : 'not priced yet'}
          </Text>
        </View>
        <View style={[styles.stat, styles.statDivider, { borderLeftColor: c.border }]}>
          <Text variant="caption" tone="muted">
            Since the trade
          </Text>
          <Text variant="headline" tone={overall === null ? 'muted' : overall >= 0 ? 'gain' : 'loss'}>
            {overall === null ? '—' : formatMove(overall)}
          </Text>
          <Text variant="footnote" tone="faint">
            {trade.price_now != null
              ? `${formatPrice(trade.price_now)} on ${shortDate(trade.price_now_day ?? null)}`
              : 'no recent close'}
          </Text>
        </View>
      </View>

      <Text variant="footnote" tone="faint">
        Daily closing prices, split-adjusted. A move in the trader&apos;s favour is not proof of anything, and the
        filing gives a range, not the trade&apos;s price.
      </Text>
      <NotAdvice />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.xl, padding: 16, gap: 14, borderWidth: StyleSheet.hairlineWidth },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  hero: { gap: 4 },
  stats: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14 },
  stat: { flex: 1, gap: 2, paddingRight: 10 },
  statDivider: { borderLeftWidth: StyleSheet.hairlineWidth, paddingLeft: 14 },
});
