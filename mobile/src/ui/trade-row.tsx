import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import type { Trade } from '@/lib/api';
import { amountLabel, assetLabel, filedAgo, memberName, tradePill, tradeTone, tradeVerb } from '@/lib/format';
import { rememberTrades } from '@/lib/trade-cache';
import { useTheme } from '@/theme';
import { Avatar } from '@/ui/avatar';
import { Pill } from '@/ui/pill';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';
import { TickerLogo } from '@/ui/ticker-logo';

/**
 * One trade as a sentence: who, what they did, how much, and when it was filed.
 *
 * "Nancy Pelosi · Bought Apple (AAPL) · $1,000,001 – $5,000,000" reads in one
 * glance, which a row of labelled columns does not. `lead` picks the face at
 * the left: the member in a feed, the company on a member's own page, where
 * her photo a hundred times over would say nothing.
 */
export function TradeRow({
  trade,
  lead = 'member',
  divider = true,
}: {
  trade: Trade;
  lead?: 'member' | 'asset';
  divider?: boolean;
}) {
  const { c } = useTheme();
  const router = useRouter();
  const asset = assetLabel(trade);
  const ticker = trade.ticker ? ` (${trade.ticker})` : '';

  return (
    <Tap
      scaleTo={0.985}
      onPress={() => {
        rememberTrades([trade]);
        router.push({ pathname: '/trade/[id]', params: { id: String(trade.id) } });
      }}
      style={styles.row}>
      {lead === 'member' ? (
        <Avatar uri={trade.photo_url} name={memberName(trade)} party={trade.party} size={48} />
      ) : (
        <TickerLogo ticker={trade.ticker ?? asset} logo={trade.logo_url} size={48} />
      )}
      <View
        style={[styles.body, divider && { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
        <View style={styles.text}>
          {lead === 'member' ? (
            <Text variant="bodyStrong" numberOfLines={1}>
              {memberName(trade)}
            </Text>
          ) : null}
          <Text variant={lead === 'member' ? 'callout' : 'bodyStrong'} numberOfLines={2}>
            <Text variant={lead === 'member' ? 'callout' : 'bodyStrong'} style={styles.verb}>
              {tradeVerb(trade.transaction_type)}{' '}
            </Text>
            <Text variant={lead === 'member' ? 'callout' : 'bodyStrong'} tone={lead === 'member' ? 'muted' : 'default'}>
              {asset}
              {ticker}
            </Text>
          </Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {amountLabel(trade.amount_range)}
          </Text>
        </View>
        <View style={styles.side}>
          <Pill label={tradePill(trade.transaction_type)} tone={tradeTone(trade.transaction_type)} />
          <Text variant="footnote" tone="faint">
            {filedAgo(trade.filing_date)}
          </Text>
        </View>
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 16 },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16, paddingRight: 16 },
  text: { flex: 1, gap: 3 },
  verb: { fontWeight: '700' },
  side: { alignItems: 'flex-end', gap: 6 },
});
