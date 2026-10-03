import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { Trade } from '@/lib/api';
import { memberName, surname } from '@/lib/format';
import { change, dayOffset, fetchPriceSeries, formatMove, formatPrice, today, type PricePoint } from '@/lib/prices';
import { radius, useTheme } from '@/theme';
import { PriceChart, type ChartMarker } from '@/ui/price-chart';
import { Segmented } from '@/ui/segmented';
import { Skeleton } from '@/ui/skeleton';
import { NotAdvice } from '@/ui/not-advice';
import { Text } from '@/ui/text';

const RANGES = [
  { key: '6m', label: '6M', days: 183 },
  { key: '1y', label: '1Y', days: 365 },
  { key: '2y', label: '2Y', days: 730 },
  { key: '5y', label: '5Y', days: 1826 },
] as const;
type RangeKey = (typeof RANGES)[number]['key'];

/**
 * A company's price with Congress's trades on it: a green dot where a member
 * bought, a red one where one sold, on the close that day. Drag along it to
 * see who traded on a given day.
 *
 * Five years are fetched once and the ranges are cut from them, so switching
 * range is instant. The dots come from the trades the screen already has
 * (the latest hundred), which is what the caption says.
 */
export function IssuerPriceCard({ ticker, trades }: { ticker: string; trades: Trade[] }) {
  const { c } = useTheme();
  const [points, setPoints] = useState<PricePoint[] | null | undefined>(undefined);
  const [range, setRange] = useState<RangeKey>('1y');

  useEffect(() => {
    let live = true;
    void fetchPriceSeries(ticker, dayOffset(today(), -RANGES[RANGES.length - 1].days)).then(
      (p) => live && setPoints(p)
    );
    return () => {
      live = false;
    };
  }, [ticker]);

  const shown = useMemo(() => {
    if (!points?.length) return null;
    const days = RANGES.find((r) => r.key === range)!.days;
    const from = dayOffset(points[points.length - 1].d, -days);
    return points.filter((p) => p.d >= from);
  }, [points, range]);

  const markers = useMemo<ChartMarker[]>(() => {
    if (!shown?.length) return [];
    const from = shown[0].d;
    return trades
      .filter((t) => t.transaction_date && t.transaction_date >= from && /^[PS]/i.test(t.transaction_type))
      .map((t) => {
        const buy = /^P/i.test(t.transaction_type);
        return {
          day: t.transaction_date!,
          kind: buy ? ('buy' as const) : ('sell' as const),
          label: `${surname(memberName(t))} ${buy ? 'bought' : 'sold'}`,
        };
      });
  }, [shown, trades]);

  // Nothing to draw: the price source does not know this ticker.
  if (points === null || (points && points.length < 2)) return null;

  const last = shown?.[shown.length - 1];
  const move = shown && last ? change(shown[0].c, last.c) : null;
  const buys = markers.filter((m) => m.kind === 'buy').length;
  const sells = markers.length - buys;

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.head}>
        <Text variant="subhead">Price, with Congress&apos;s trades</Text>
      </View>

      {shown ? (
        <PriceChart
          points={shown}
          markers={markers}
          height={190}
          idle={
            last ? (
              <View style={styles.idle}>
                <Text variant="bodyStrong">{formatPrice(last.c)}</Text>
                {move !== null ? (
                  <Text variant="footnote" tone={move >= 0 ? 'gain' : 'loss'} style={styles.bold}>
                    {formatMove(move)}
                  </Text>
                ) : null}
                <Text variant="footnote" tone="faint">
                  over {RANGES.find((r) => r.key === range)!.label}
                </Text>
              </View>
            ) : null
          }
        />
      ) : (
        <Skeleton width="100%" height={216} round={12} />
      )}

      <Segmented options={RANGES} value={range} onChange={setRange} />

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: c.gain }]} />
          <Text variant="footnote" tone="muted">
            {buys} bought
          </Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.dot, { backgroundColor: c.loss }]} />
          <Text variant="footnote" tone="muted">
            {sells} sold
          </Text>
        </View>
        <Text variant="footnote" tone="faint" style={styles.flex} numberOfLines={1}>
          in this range
        </Text>
      </View>
      <Text variant="footnote" tone="faint">
        Dots are the latest {trades.length} trades, at each day&apos;s close. Drag along the chart to see who traded
        when.
      </Text>
      <NotAdvice />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.xl, padding: 16, gap: 12, borderWidth: StyleSheet.hairlineWidth },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  idle: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  bold: { fontWeight: '700' },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  flex: { flex: 1 },
});
