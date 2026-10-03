import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Trade } from '@/lib/api';
import { shortDate } from '@/lib/format';
import {
  dayOffset,
  fetchPriceSeries,
  formatMove,
  formatPrice,
  moveBeforeDisclosure,
  moveSinceDisclosure,
  moveSinceTrade,
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
 * What the stock has done since one trade.
 *
 * The headline is the move from the trade date to the latest close, counted
 * in the member's favour (the rise since a purchase, the fall since a sale),
 * with whether it went their way. Under it, the price with the stretch before
 * disclosure shaded, and the two parts of that move: while only the member
 * knew, and since the public could see it.
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

  // To today by default, since that is the headline figure; the close-up
  // around the trade is one tap away.
  const [range, setRange] = useState<Range>('today');
  const aroundEnd = filed ? dayOffset(filed, MARGIN_DAYS) : null;
  const shown = useMemo(() => {
    if (!points) return null;
    return range === 'around' && aroundEnd ? points.filter((p) => p.d <= aroundEnd) : points;
  }, [points, range, aroundEnd]);
  // Worth offering both only when "to today" runs well past the close-up.
  const canToggle = Boolean(points && aroundEnd && points.filter((p) => p.d > aroundEnd).length > 20);

  if (!priced || !traded) return null;

  const buy = /^P/i.test(trade.transaction_type);
  const sell = /^S/i.test(trade.transaction_type);
  // Since the trade, counted in the member's favour: the rise since a
  // purchase, the fall since a sale. The card's headline figure.
  const edgeNow = overall === null || (!buy && !sell) ? null : buy ? overall : -overall;
  const gap = filed ? daysBetween(traded, filed) : null;
  const late = gap !== null && gap > DEADLINE_DAYS;
  const sameDay = gap === 0;

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.head}>
        <Text variant="subhead">Since the trade</Text>
        {edgeNow !== null && edgeNow !== 0 ? (
          <Pill
            label={edgeNow > 0 ? 'Went their way' : 'Went against them'}
            tone={edgeNow > 0 ? 'gain' : 'loss'}
            solid={false}
          />
        ) : null}
      </View>

      {overall !== null ? (
        <View style={styles.hero}>
          {edgeNow !== null ? (
            <View style={styles.figureRow}>
              <Text variant="display" tone={edgeNow >= 0 ? 'gain' : 'loss'}>
                {formatMove(edgeNow)}
              </Text>
              <Text variant="caption" tone="muted" style={styles.figureNote}>
                {buy ? 'since they bought' : 'since they sold'}
              </Text>
            </View>
          ) : null}
          <Text variant="callout" tone="muted">
            From {formatPrice(trade.price_at_trade!)} on {shortDate(traded)} to {formatPrice(trade.price_now!)} at the
            latest close
            {sell ? `: the stock has ${overall < 0 ? 'fallen' : 'risen'} ${formatMove(Math.abs(overall)).replace('+', '')} since they sold` : ''}
            .
            {before !== null && gap ? (
              ` When it was disclosed, ${gap} ${gap === 1 ? 'day' : 'days'} later${late ? ` (past the ${DEADLINE_DAYS} days the law allows)` : ''}, it stood at ${formatPrice(trade.price_at_filing!)}, ${formatMove(before)} from the trade.`
            ) : sameDay ? (
              ' It was disclosed the same day.'
            ) : null}
          </Text>
        </View>
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
            Before disclosure
          </Text>
          <Text variant="headline" tone={before === null ? 'muted' : before >= 0 ? 'gain' : 'loss'}>
            {before === null ? '—' : formatMove(before)}
          </Text>
          <Text variant="footnote" tone="faint">
            {sameDay ? 'disclosed the same day' : gap ? `the ${gap} ${gap === 1 ? 'day' : 'days'} only they knew` : 'not priced yet'}
          </Text>
        </View>
        <View style={[styles.stat, styles.statDivider, { borderLeftColor: c.border }]}>
          <Text variant="caption" tone="muted">
            Since disclosure
          </Text>
          <Text variant="headline" tone={since === null ? 'muted' : since >= 0 ? 'gain' : 'loss'}>
            {since === null ? '—' : formatMove(since)}
          </Text>
          <Text variant="footnote" tone="faint">
            {trade.price_at_filing != null ? `from ${formatPrice(trade.price_at_filing)} when it became public` : 'not priced yet'}
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
  figureRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
  figureNote: { fontWeight: '600' },
  stats: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14 },
  stat: { flex: 1, gap: 2, paddingRight: 10 },
  statDivider: { borderLeftWidth: StyleSheet.hairlineWidth, paddingLeft: 14 },
});
