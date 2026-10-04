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
  key: string;
  /** Who, for showing one trade per member when filling from anyone's. */
  who: string;
  name: string;
  photo: string | null;
  party: string | null;
  ticker: string;
  what: string;
  amount: string;
  filed: string;
};

// How many filings the card shows.
const SHOWN = 3;
// Picked members whose recent trades are looked through, at most: one request each.
const MEMBERS_ASKED = 5;

// A stock bought or sold: options (OP) carry the underlying's ticker too, but
// read as "Sold PUT/XSP @ 730 EXP 11/20/2026".
const isStockBuyOrSale = (t: { ticker: string | null; transaction_type: string; asset_type_code?: string | null }) =>
  !!t.ticker && /^[PS]/i.test(t.transaction_type) && (t.asset_type_code ?? 'ST') === 'ST';

/**
 * The most recent stock purchases and sales: first those of the members
 * picked during setup, newest filed first, then filled up with the latest
 * filings by anyone else, one per member. Empty until loaded (and if nothing
 * can be), as the screen is complete without it.
 *
 * Each picked member comes from their page's free endpoint rather than a
 * member filter on /api/trades, which is a Pro filter the API drops for
 * everyone else, and everyone on this screen is someone else.
 */
export function useLatestFilings(filedNames: string[]): Filing[] {
  const [latest, setLatest] = useState<Filing[]>([]);
  // Spellings of one person can differ; their slugs mostly do not.
  const slugs = [...new Set(filedNames.map(memberSlug))].slice(0, MEMBERS_ASKED);
  const key = slugs.join(',');

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const theirs = async (): Promise<Filing[]> => {
      if (!key) return [];
      const pages = await Promise.all(
        key.split(',').map((slug) => fetchPolitician(slug, { signal }).catch(() => null))
      );
      return pages
        .flatMap((page) =>
          page
            ? page.trades
                .filter(isStockBuyOrSale)
                .slice(0, SHOWN)
                .map((t) =>
                  asFiling(page.profile.slug, page.profile.display, page.profile.photo_url, page.profile.party, t)
                )
            : []
        )
        .sort((a, b) => b.filed.localeCompare(a.filed))
        .slice(0, SHOWN);
    };
    const anyone = async (exclude: Set<string>, count: number): Promise<Filing[]> => {
      if (count <= 0) return [];
      const res = await fetchTrades({ limit: 40, assetTypes: ['ST'] }, { signal });
      const picked: Filing[] = [];
      for (const t of res.data.filter(isStockBuyOrSale)) {
        const who = t.member_slug ?? t.member_name;
        if (exclude.has(who)) continue;
        exclude.add(who);
        picked.push(asFiling(who, memberName(t), t.photo_url, t.party, t));
        if (picked.length === count) break;
      }
      return picked;
    };
    theirs()
      .then(async (mine) => [...mine, ...(await anyone(new Set(mine.map((f) => f.who)), SHOWN - mine.length))])
      .then(setLatest)
      .catch(() => {});
    return () => controller.abort();
  }, [key]);
  return latest;
}

function asFiling(
  who: string,
  name: string,
  photo: string | null,
  party: string | null,
  t: Pick<Trade, 'id' | 'asset_name' | 'ticker' | 'company_name' | 'transaction_type' | 'amount_range' | 'filing_date'>
): Filing {
  return {
    key: String(t.id),
    who,
    filed: t.filing_date ?? '',
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
 * The latest real filings, as proof the feed is live: those of the members
 * picked during setup first, then anyone's.
 */
export function LatestFilingsCard({ filedNames }: { filedNames: string[] }) {
  const { c } = useTheme();
  const latest = useLatestFilings(filedNames);
  if (!latest.length) return null;
  return (
    <Animated.View
      entering={FadeInDown.duration(380)}
      style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.head}>
        <View style={[styles.liveDot, { backgroundColor: c.gain }]} />
        <Text variant="caption" tone="muted" style={styles.semibold}>
          Latest filings
        </Text>
      </View>
      {latest.map((f, i) => (
        <View
          key={f.key}
          style={[styles.row, i > 0 && { borderTopColor: c.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
          <Avatar uri={f.photo} name={f.name} party={f.party} size={36} />
          <View style={styles.flex}>
            <Text variant="callout" style={styles.bold} numberOfLines={1}>
              {f.name}
            </Text>
            <View style={styles.asset}>
              <TickerLogo ticker={f.ticker} size={16} />
              <Text variant="footnote" tone="muted" numberOfLines={1} style={styles.flex}>
                {f.what}
              </Text>
            </View>
          </View>
          <Text variant="footnote" style={styles.bold}>
            {f.amount}
          </Text>
        </View>
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 4,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 4 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  asset: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  flex: { flex: 1 },
  bold: { fontWeight: '700' },
  semibold: { fontWeight: '600' },
});
