import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Platform, Pressable, ScrollView, StyleSheet, View, useColorScheme } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { memberName, partyColor, shortDate, transactionLabel, transactionTone } from '@/lib/format';
import { recallTrade } from '@/lib/trade-cache';

const TONE_COLORS = {
  buy: { light: '#1a7f4b', dark: '#4ade80' },
  sell: { light: '#c2334d', dark: '#f87171' },
  neutral: { light: '#a16207', dark: '#fbbf24' },
} as const;

function Row({ label, value }: { label: string; value: string }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return (
    <View style={[styles.row, { borderBottomColor: Colors[scheme].backgroundElement }]}>
      <ThemedText style={[styles.rowLabel, { color: Colors[scheme].textSecondary }]}>{label}</ThemedText>
      <ThemedText style={styles.rowValue}>{value}</ThemedText>
    </View>
  );
}

/**
 * One trade in full.
 *
 * The card in the feed shows the six fields that matter at a glance; this shows
 * everything the filing carries, including the two dates whose gap is the whole
 * point of a Periodic Transaction Report. The source PDF is one tap away,
 * because the site's own promise is that you can check it yourself.
 */
export default function TradeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const trade = recallTrade(Number(id));

  if (!trade) {
    return (
      <ThemedView style={styles.missing}>
        <Stack.Screen options={{ title: 'Trade' }} />
        <ThemedText style={styles.missingTitle}>Trade not loaded</ThemedText>
        <ThemedText style={[styles.missingBody, { color: colors.textSecondary }]}>
          Open it from the feed. Trades opened from a link need an endpoint the site doesn&apos;t have yet.
        </ThemedText>
      </ThemedView>
    );
  }

  const tone = TONE_COLORS[transactionTone(trade.transaction_type)][scheme];
  const openFiling = () =>
    Platform.OS === 'web'
      ? window.open(trade.pdf_url, '_blank')
      : WebBrowser.openBrowserAsync(trade.pdf_url);

  return (
    <ThemedView style={styles.screen}>
      <Stack.Screen options={{ title: trade.ticker ?? 'Trade' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          {trade.photo_url ? (
            <Image source={{ uri: trade.photo_url }} style={styles.photo} contentFit="cover" transition={150} />
          ) : (
            <View style={[styles.photo, { backgroundColor: colors.backgroundElement }]} />
          )}
          <View style={styles.headerText}>
            <ThemedText style={styles.name}>{memberName(trade)}</ThemedText>
            <View style={styles.partyRow}>
              <View style={[styles.partyDot, { backgroundColor: partyColor(trade.party) }]} />
              <ThemedText style={[styles.meta, { color: colors.textSecondary }]}>
                {[trade.party, trade.member_state ?? trade.state_district, trade.chamber === 'senate' ? 'Senate' : 'House']
                  .filter(Boolean)
                  .join(' · ')}
              </ThemedText>
            </View>
          </View>
        </View>

        <View style={[styles.assetBlock, { backgroundColor: colors.backgroundElement }]}>
          <ThemedText style={[styles.tone, { color: tone }]}>{transactionLabel(trade.transaction_type)}</ThemedText>
          <ThemedText style={styles.asset}>{trade.asset_name}</ThemedText>
          <ThemedText style={styles.amount}>{trade.amount_range ?? 'Amount not disclosed'}</ThemedText>
        </View>

        <View style={styles.rows}>
          {trade.ticker ? <Row label="Ticker" value={trade.ticker} /> : null}
          {trade.asset_type_code ? <Row label="Asset type" value={trade.asset_type_code} /> : null}
          {trade.owner ? <Row label="Owner" value={trade.owner} /> : null}
          <Row label="Traded" value={shortDate(trade.transaction_date)} />
          <Row label="Member notified" value={shortDate(trade.notification_date)} />
          <Row label="Filed" value={shortDate(trade.filing_date)} />
          {trade.days_to_file !== null ? <Row label="Days to file" value={String(trade.days_to_file)} /> : null}
        </View>

        {/* The filing is the authority, not us. Section 7 of the terms says the
            same thing, and every surface should make checking it this easy. */}
        <Pressable onPress={openFiling} style={[styles.filing, { backgroundColor: colors.backgroundSelected }]}>
          <ThemedText style={styles.filingLabel}>View the original filing</ThemedText>
        </Pressable>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 20, gap: 18, paddingBottom: 40 },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  missingTitle: { fontSize: 17, fontWeight: '600' },
  missingBody: { fontSize: 14, lineHeight: 20, textAlign: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  photo: { width: 60, height: 60, borderRadius: 30 },
  headerText: { flex: 1, gap: 4 },
  name: { fontSize: 20, fontWeight: '700' },
  partyRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  partyDot: { width: 9, height: 9, borderRadius: 5 },
  meta: { fontSize: 13 },
  assetBlock: { borderRadius: 14, padding: 16, gap: 6 },
  tone: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  asset: { fontSize: 16, lineHeight: 22, fontWeight: '600' },
  amount: { fontSize: 18, fontWeight: '700' },
  rows: { gap: 0 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rowLabel: { fontSize: 14 },
  rowValue: { fontSize: 14, fontWeight: '600' },
  filing: { alignItems: 'center', borderRadius: 12, paddingVertical: 14 },
  filingLabel: { fontSize: 15, fontWeight: '600' },
});
