import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useFollows } from '@/lib/follows';
import {
  amountLabel,
  assetLabel,
  filedAgo,
  isPartialSale,
  memberName,
  PARTIAL_SALE_NOTE,
  shortDate,
  tradePill,
  tradeTone,
  tradeVerb,
} from '@/lib/format';
import { openPage } from '@/lib/links';
import { recallTrade } from '@/lib/trade-cache';
import { ASSET_TYPES } from '@/lib/trade-filters';
import { partyTone, radius, shadow, useTheme } from '@/theme';
import { Avatar } from '@/ui/avatar';
import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { FollowStar } from '@/ui/follow-button';
import { Icon } from '@/ui/icon';
import { Pill } from '@/ui/pill';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';
import { TickerLogo } from '@/ui/ticker-logo';
import { TradePriceCard } from '@/ui/trade-price-card';

// The website's labels, so a code reads the same on both.
const ASSET_TYPE_LABELS: Record<string, string> = Object.fromEntries(ASSET_TYPES.map((a) => [a.key, a.label]));

const OWNERS: Record<string, string> = { SP: 'Spouse', JT: 'Joint', DC: 'Dependent child', self: 'The member' };

// The STOCK Act's deadline: 45 days from being notified of a trade.
const DEADLINE_DAYS = 45;

function Step({
  label,
  date,
  last,
  highlight,
}: {
  label: string;
  date: string | null;
  last?: boolean;
  highlight?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View style={styles.step}>
      <View style={styles.rail}>
        <View style={[styles.dot, { backgroundColor: highlight ? c.accent : c.primary }]} />
        {!last ? <View style={[styles.line, { backgroundColor: c.border }]} /> : null}
      </View>
      <View style={styles.stepText}>
        <Text variant="caption" tone="muted">
          {label}
        </Text>
        <Text variant="bodyStrong">{date ? shortDate(date) : 'Not stated'}</Text>
      </View>
    </View>
  );
}

/**
 * One trade in full.
 *
 * Read top to bottom like a receipt: what happened and for how much, what the
 * stock did before anyone else knew, who did it, the three dates whose gaps are the point of a disclosure, and the
 * filing itself, which is the authority rather than us.
 */
export default function TradeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { c, scheme } = useTheme();
  const router = useRouter();
  const follows = useFollows();
  const trade = recallTrade(Number(id));

  if (!trade) {
    return (
      <View style={[styles.screen, { backgroundColor: c.background }]}>
        <EmptyState
          icon="document-text-outline"
          title="This trade isn't loaded"
          body="Open it from a feed, a member or a company, and it will be here."
          action="Go to Discover"
          onAction={() => router.replace('/')}
        />
      </View>
    );
  }

  const asset = assetLabel(trade);
  const late = trade.days_to_file !== null && trade.days_to_file > DEADLINE_DAYS;
  const name = memberName(trade);
  const subtitle = [trade.member_state ?? trade.state_district, trade.chamber === 'senate' ? 'Senate' : 'House']
    .filter(Boolean)
    .join(' · ');

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content}>
      <View
        style={[
          styles.hero,
          { backgroundColor: c.surface, borderColor: c.border },
          scheme === 'light' ? shadow.card : null,
        ]}>
        <View style={styles.heroTop}>
          <Pill label={tradePill(trade.transaction_type)} tone={tradeTone(trade.transaction_type)} />
          <Text variant="footnote" tone="faint">
            Filed {filedAgo(trade.filing_date).toLowerCase()}
          </Text>
        </View>
        <Tap
          disabled={!trade.ticker}
          dimWhenDisabled={false}
          scaleTo={0.98}
          onPress={() =>
            trade.ticker && router.push({ pathname: '/issuer/[slug]', params: { slug: trade.ticker.toLowerCase() } })
          }
          style={styles.assetRow}>
          <TickerLogo ticker={trade.ticker ?? asset} logo={trade.logo_url} size={56} />
          <View style={styles.flex}>
            <Text variant="caption" tone="muted">
              {tradeVerb(trade.transaction_type)}
            </Text>
            <Text variant="headline" numberOfLines={2}>
              {asset}
              {trade.ticker ? ` (${trade.ticker})` : ''}
            </Text>
          </View>
          {trade.ticker ? <Icon name="chevron-forward" size={18} color={c.textFaint} /> : null}
        </Tap>
        <View style={[styles.amount, { backgroundColor: c.surfaceMuted }]}>
          <Text variant="caption" tone="muted">
            Disclosed amount
          </Text>
          <Text variant="title">{amountLabel(trade.amount_range)}</Text>
        </View>
        {isPartialSale(trade.transaction_type) ? (
          <Text variant="caption" tone="muted">
            {PARTIAL_SALE_NOTE}
          </Text>
        ) : null}
      </View>

      <TradePriceCard trade={trade} />

      <Tap
        disabled={!trade.member_slug}
        dimWhenDisabled={false}
        feedback="tap"
        scaleTo={0.98}
        onPress={() =>
          trade.member_slug && router.push({ pathname: '/politician/[slug]', params: { slug: trade.member_slug } })
        }
        style={[styles.member, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Avatar uri={trade.photo_url} name={name} party={trade.party} size={52} />
        <View style={styles.flex}>
          <Text variant="subhead">{name}</Text>
          <View style={styles.partyRow}>
            <View style={[styles.partyDot, { backgroundColor: partyTone(trade.party) }]} />
            <Text variant="caption" tone="muted">
              {[trade.party, subtitle].filter(Boolean).join(' · ')}
            </Text>
          </View>
        </View>
        {trade.member_slug ? (
          <FollowStar
            following={follows.isFollowingMember(trade.member_slug)}
            onPress={() =>
              follows.toggleMember({
                slug: trade.member_slug!,
                name,
                photo_url: trade.photo_url,
                party: trade.party,
                subtitle,
              })
            }
          />
        ) : null}
      </Tap>

      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <View style={styles.cardHead}>
          <Text variant="subhead">Timeline</Text>
          {trade.days_to_file !== null ? (
            <Pill
              label={late ? `Filed late · ${trade.days_to_file}d` : `Filed in ${trade.days_to_file}d`}
              tone={late ? 'warn' : 'neutral'}
              solid={false}
            />
          ) : null}
        </View>
        <Step label="Traded" date={trade.transaction_date} />
        <Step label="Member notified" date={trade.notification_date} />
        <Step label="Filed publicly" date={trade.filing_date} last highlight={late} />
        {late ? (
          <Text variant="caption" tone="muted">
            The law allows {DEADLINE_DAYS} days from notification. This one took longer.
          </Text>
        ) : null}
      </View>

      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Text variant="subhead">Details</Text>
        {[
          [
            'Asset type',
            trade.asset_type_code ? (ASSET_TYPE_LABELS[trade.asset_type_code] ?? trade.asset_type_code) : null,
          ],
          ['Owner', trade.owner ? (OWNERS[trade.owner] ?? trade.owner) : 'The member'],
          ['Chamber', trade.chamber === 'senate' ? 'Senate' : 'House'],
        ]
          .filter((r): r is [string, string] => Boolean(r[1]))
          .map(([label, value]) => (
            <View key={label} style={[styles.detail, { borderBottomColor: c.border }]}>
              <Text variant="callout" tone="muted">
                {label}
              </Text>
              <Text variant="callout" style={styles.bold}>
                {value}
              </Text>
            </View>
          ))}
        <Text variant="caption" tone="faint">
          As filed: {trade.asset_name}
        </Text>
      </View>

      {/* The filing is the authority, not us, and checking it should be this easy. */}
      <Button label="View the original filing" icon="document-text-outline" onPress={() => openPage(trade.pdf_url)} />
      {trade.ticker ? (
        <Button
          label={`Alert me when ${trade.ticker} is traded`}
          icon="notifications-outline"
          kind="secondary"
          onPress={() =>
            router.push({
              pathname: '/alert/[id]',
              params: { id: 'new', tickers: trade.ticker!, name: `Congress trading ${trade.ticker}` },
            })
          }
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center' },
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  flex: { flex: 1, gap: 2 },
  hero: { borderRadius: radius.xxl, padding: 18, gap: 16, borderWidth: StyleSheet.hairlineWidth },
  heroTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  assetRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  amount: { borderRadius: radius.lg, padding: 14, gap: 2 },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  partyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  partyDot: { width: 8, height: 8, borderRadius: 4 },
  card: { borderRadius: radius.xl, padding: 16, gap: 12, borderWidth: StyleSheet.hairlineWidth },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  step: { flexDirection: 'row', gap: 14 },
  rail: { alignItems: 'center', width: 14 },
  dot: { width: 12, height: 12, borderRadius: 6, marginTop: 4 },
  line: { width: 2, flex: 1, marginTop: 4, minHeight: 26 },
  stepText: { flex: 1, gap: 1, paddingBottom: 6 },
  detail: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bold: { fontWeight: '600' },
});
