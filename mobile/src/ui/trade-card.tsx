import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import type { Trade } from '@/lib/api';
import { amountLabel, assetLabel, filedAgo, memberName, tradePill, tradeTone, tradeVerb } from '@/lib/format';
import { rememberTrades } from '@/lib/trade-cache';
import { radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/avatar';
import { Pill } from '@/ui/pill';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';
import { TickerLogo } from '@/ui/ticker-logo';

/**
 * One trade as a card, for a row that scrolls sideways (Discover's latest
 * trades): who, what they did to which company, how much, and when it was
 * filed. TradeRow is the same trade as a list row.
 */
export function TradeCard({ trade, width = 264 }: { trade: Trade; width?: number }) {
  const { c } = useTheme();
  const router = useRouter();
  const asset = assetLabel(trade);
  const name = memberName(trade);
  return (
    <Tap
      feedback="tap"
      scaleTo={0.97}
      onPress={() => {
        rememberTrades([trade]);
        router.push({ pathname: '/trade/[id]', params: { id: String(trade.id) } });
      }}
      style={[styles.card, { width, backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.top}>
        <Avatar uri={trade.photo_url} name={name} party={trade.party} size={40} />
        <View style={styles.flex}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {name}
          </Text>
          <Text variant="footnote" tone="faint">
            {filedAgo(trade.filing_date)}
          </Text>
        </View>
        <Pill label={tradePill(trade.transaction_type)} tone={tradeTone(trade.transaction_type)} />
      </View>
      <View style={styles.asset}>
        <TickerLogo ticker={trade.ticker ?? asset} size={36} />
        <View style={styles.flex}>
          <Text variant="callout" numberOfLines={2}>
            <Text variant="callout" style={styles.bold}>
              {tradeVerb(trade.transaction_type)}{' '}
            </Text>
            {asset}
            {trade.ticker ? ` (${trade.ticker})` : ''}
          </Text>
        </View>
      </View>
      <Text variant="caption" tone="muted">
        {amountLabel(trade.amount_range)}
      </Text>
    </Tap>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, gap: 12, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  asset: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  flex: { flex: 1 },
  bold: { fontWeight: '700' },
});
