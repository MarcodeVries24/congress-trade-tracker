import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View, useColorScheme } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import type { Trade } from '@/lib/api';
import { compactAmount, memberName, partyColor, shortDate, transactionLabel, transactionTone } from '@/lib/format';

const TONE_COLORS = {
  buy: { light: '#1a7f4b', dark: '#4ade80' },
  sell: { light: '#c2334d', dark: '#f87171' },
  neutral: { light: '#a16207', dark: '#fbbf24' },
} as const;

/**
 * One trade, as a card rather than a table row.
 *
 * The website shows these in a table because a desktop has the width for
 * columns. A phone does not, so the same six fields are arranged by weight
 * instead: who and what they traded read first, the amount and the dates are
 * secondary, and the party is a colour rather than a word.
 */
export function TradeCard({ trade }: { trade: Trade }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const tone = transactionTone(trade.transaction_type);
  const toneColor = TONE_COLORS[tone][scheme];
  const router = useRouter();

  // router.push rather than <Link asChild>: asChild renders an anchor around
  // the card, and on web that anchor's inline layout collapsed the card's
  // background and its party bar.
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/trade/[id]', params: { id: String(trade.id) } })}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.backgroundElement, opacity: pressed ? 0.7 : 1 }]}>
      <View style={[styles.partyBar, { backgroundColor: partyColor(trade.party) }]} />

      <View style={styles.body}>
        <View style={styles.header}>
          {trade.photo_url ? (
            <Image source={{ uri: trade.photo_url }} style={styles.photo} contentFit="cover" transition={150} />
          ) : (
            <View style={[styles.photo, { backgroundColor: colors.backgroundSelected }]} />
          )}
          <View style={styles.headerText}>
            <ThemedText numberOfLines={1} style={styles.name}>
              {memberName(trade)}
            </ThemedText>
            <ThemedText numberOfLines={1} style={[styles.meta, { color: colors.textSecondary }]}>
              {[trade.member_state ?? trade.state_district, trade.chamber === 'senate' ? 'Senate' : 'House']
                .filter(Boolean)
                .join(' · ')}
            </ThemedText>
          </View>
          <ThemedText style={[styles.tone, { color: toneColor }]}>
            {transactionLabel(trade.transaction_type)}
          </ThemedText>
        </View>

        <ThemedText numberOfLines={2} style={styles.asset}>
          {trade.ticker ? <ThemedText style={styles.ticker}>{trade.ticker} </ThemedText> : null}
          {trade.asset_name}
        </ThemedText>

        <View style={styles.footer}>
          <ThemedText style={styles.amount}>{compactAmount(trade.amount_range)}</ThemedText>
          <ThemedText style={[styles.meta, { color: colors.textSecondary }]}>
            Traded {shortDate(trade.transaction_date)}
          </ThemedText>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', borderRadius: 14, overflow: 'hidden', marginHorizontal: 16, marginBottom: 10 },
  partyBar: { width: 4 },
  body: { flex: 1, padding: 14, gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  photo: { width: 36, height: 36, borderRadius: 18 },
  headerText: { flex: 1, gap: 1 },
  name: { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  meta: { fontSize: 12, lineHeight: 16 },
  tone: { fontSize: 12, fontWeight: '700' },
  asset: { fontSize: 14, lineHeight: 19 },
  ticker: { fontWeight: '700' },
  footer: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  amount: { fontSize: 15, fontWeight: '700' },
});
