import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View, useColorScheme } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import type { Trade } from '@/lib/api';
import { compactAmount, memberName, shortDate, transactionLabel, transactionTone } from '@/lib/format';

const TONE_COLORS = {
  buy: { light: '#1a7f4b', dark: '#4ade80' },
  sell: { light: '#c2334d', dark: '#f87171' },
  neutral: { light: '#a16207', dark: '#fbbf24' },
} as const;

/**
 * One trade as a single row, for a page that is already about one member or
 * one company. The feed's card repeats the member's photo and name on every
 * trade, which on that member's own page is the same face a hundred times.
 *
 * `lead` picks what the row leads with: the asset on a member's page, the
 * member on a company's page.
 */
export function CompactTradeRow({ trade, lead }: { trade: Trade; lead: 'asset' | 'member' }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const router = useRouter();
  const tone = TONE_COLORS[transactionTone(trade.transaction_type)][scheme];

  const primary = lead === 'asset' ? (trade.ticker ?? trade.asset_name) : memberName(trade);
  const secondary = lead === 'asset' ? (trade.ticker ? trade.asset_name : null) : null;

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/trade/[id]', params: { id: String(trade.id) } })}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.backgroundElement, opacity: pressed ? 0.6 : 1 },
      ]}>
      <View style={styles.main}>
        <ThemedText numberOfLines={1} style={styles.primary}>
          {primary}
        </ThemedText>
        {secondary ? (
          <ThemedText numberOfLines={1} style={[styles.secondary, { color: colors.textSecondary }]}>
            {secondary}
          </ThemedText>
        ) : null}
        <ThemedText style={[styles.secondary, { color: colors.textSecondary }]}>
          Traded {shortDate(trade.transaction_date)}
        </ThemedText>
      </View>
      <View style={styles.side}>
        <ThemedText style={[styles.tone, { color: tone }]}>{transactionLabel(trade.transaction_type)}</ThemedText>
        <ThemedText style={styles.amount}>{compactAmount(trade.amount_range)}</ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    marginHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  main: { flex: 1, gap: 2 },
  primary: { fontSize: 15, fontWeight: '600' },
  secondary: { fontSize: 12, lineHeight: 16 },
  side: { alignItems: 'flex-end', gap: 2 },
  tone: { fontSize: 12, fontWeight: '700' },
  amount: { fontSize: 14, fontWeight: '700' },
});
