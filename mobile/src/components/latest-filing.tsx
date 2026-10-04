import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { fetchPolitician, fetchTrades, type Trade } from '@/lib/api';
import { assetLabel, compactAmount, memberName, tradeVerb } from '@/lib/format';
import { radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/avatar';
import { Text } from '@/ui/text';
import { TickerLogo } from '@/ui/ticker-logo';

/** A filed trade as the card shows it, from either source below. */
type Filing = {
  name: string;
  photo: string | null;
  party: string | null;
  ticker: string;
  what: string;
  amount: string;
};

// Picked members whose recent trades are looked through, at most: one request
// each, and the card shows only one trade.
const MEMBERS_ASKED = 5;

// A stock bought or sold: options (OP) carry the underlying's ticker too, but
// read as "Sold PUT/XSP @ 730 EXP 11/20/2026".
const isStockBuyOrSale = (t: { ticker: string | null; transaction_type: string; asset_type_code?: string | null }) =>
  !!t.ticker && /^[PS]/i.test(t.transaction_type) && (t.asset_type_code ?? 'ST') === 'ST';

/**
 * The most recent stock purchase or sale filed by the members picked during
 * setup, or by anyone when nobody was picked or none of them has one; null
 * until it loads (and if it cannot), as the screen is complete without it.
 *
 * Each member comes from their page's free endpoint rather than a member
 * filter on /api/trades, which is a Pro filter the API drops for everyone
 * else, and everyone on this screen is someone else.
 */
export function useLatestFiling(filedNames: string[]): Filing | null {
  const [latest, setLatest] = useState<Filing | null>(null);
  // Spellings of one person can differ; their slugs mostly do not.
  const slugs = [...new Set(filedNames.map(memberSlug))].slice(0, MEMBERS_ASKED);
  const key = slugs.join(',');

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const anyone = () =>
      fetchTrades({ limit: 20, assetTypes: ['ST'] }, { signal }).then((res) => {
        const t = res.data.find(isStockBuyOrSale);
        return t ? asFiling(memberName(t), t.photo_url, t.party, t) : null;
      });
    const theirs = async () => {
      const pages = await Promise.all(
        key.split(',').map((slug) => fetchPolitician(slug, { signal }).catch(() => null))
      );
      let best: { filing: Filing; filed: string } | null = null;
      for (const page of pages) {
        const t = page?.trades.find(isStockBuyOrSale);
        if (!page || !t) continue;
        const filed = t.filing_date ?? '';
        if (!best || filed > best.filed) {
          best = { filing: asFiling(page.profile.display, page.profile.photo_url, page.profile.party, t), filed };
        }
      }
      return best?.filing ?? null;
    };
    (key ? theirs() : Promise.resolve(null))
      .then((filing) => filing ?? anyone())
      .then(setLatest)
      .catch(() => {});
    return () => controller.abort();
  }, [key]);
  return latest;
}

function asFiling(
  name: string,
  photo: string | null,
  party: string | null,
  t: Pick<Trade, 'asset_name' | 'ticker' | 'company_name' | 'transaction_type' | 'amount_range'>
): Filing {
  return {
    name,
    photo,
    party,
    ticker: t.ticker!,
    what: `${tradeVerb(t.transaction_type)} ${assetLabel(t)} (${t.ticker})`,
    amount: compactAmount(t.amount_range),
  };
}

/** A member's page slug from a filed spelling: web/lib/memberSlug.ts, which the API resolves. */
function memberSlug(name: string): string {
  return name
    .replace(/^Hon\.\s+/i, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The most recent real filing, as proof the feed is live: by a member picked
 * during setup when there is one, otherwise by anyone. Nothing until it has
 * loaded, and nothing if it can't: the screen is complete without it.
 */
export function LatestFilingCard({ filedNames }: { filedNames: string[] }) {
  const { c } = useTheme();
  const latest = useLatestFiling(filedNames);
  if (!latest) return null;
  return (
    <Animated.View
      entering={FadeInDown.duration(380)}
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.head}>
        <View style={[styles.liveDot, { backgroundColor: c.gain }]} />
        <Text variant="caption" tone="muted" style={styles.semibold}>
          Latest filing
        </Text>
      </View>
      <View style={styles.row}>
        <Avatar uri={latest.photo} name={latest.name} party={latest.party} size={36} />
        <View style={styles.flex}>
          <Text variant="callout" style={styles.bold} numberOfLines={1}>
            {latest.name}
          </Text>
          <View style={styles.asset}>
            <TickerLogo ticker={latest.ticker} size={16} />
            <Text variant="footnote" tone="muted" numberOfLines={1} style={styles.flex}>
              {latest.what}
            </Text>
          </View>
        </View>
        <Text variant="footnote" style={styles.bold}>
          {latest.amount}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 12, gap: 8, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  asset: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  flex: { flex: 1 },
  bold: { fontWeight: '700' },
  semibold: { fontWeight: '600' },
});
