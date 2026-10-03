import { StyleSheet, View } from 'react-native';

import { formatMove, type TimingSummary } from '@/lib/prices';
import { radius, useTheme } from '@/theme';
import { NotAdvice } from '@/ui/not-advice';
import { Text } from '@/ui/text';

/**
 * "Before the public knew": over a member's or a company's trades, how often
 * the stock moved the trader's way between the trade and its disclosure, and
 * by how much on average. The website's TimingPanel, in the app's cards.
 *
 * `who` is "their" on a member's page and "the trader's" on a company's,
 * where many people's trades are mixed. Too few priced trades say nothing,
 * so under three the card is not drawn.
 */
export function TimingCard({ timing, who = 'their' }: { timing: TimingSummary | null | undefined; who?: string }) {
  const { c } = useTheme();
  if (!timing || timing.priced < 3) return null;

  const share = timing.theirWay / timing.priced;
  const edge = timing.averageEdge;

  return (
    <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={styles.head}>
        <Text variant="subhead">Before the public knew</Text>
        <Text variant="caption" tone="muted">
          How the stock moved between each trade and the day it was disclosed.
        </Text>
      </View>

      <View style={styles.row}>
        <View style={styles.cell}>
          <Text variant="title">{Math.round(share * 100)}%</Text>
          <Text variant="caption" tone="muted">
            moved {who} way, of {timing.priced.toLocaleString()} trades
          </Text>
        </View>
        <View style={[styles.cell, styles.divider, { borderLeftColor: c.border }]}>
          <Text variant="title" tone={edge === null ? 'muted' : edge >= 0 ? 'gain' : 'loss'}>
            {edge === null ? '—' : formatMove(edge)}
          </Text>
          <Text variant="caption" tone="muted">
            average move, in {who === 'their' ? 'their' : "the trader's"} favour
          </Text>
        </View>
      </View>

      <View style={[styles.track, { backgroundColor: c.lossSoft }]}>
        <View style={[styles.fill, { width: `${share * 100}%`, backgroundColor: c.gain }]} />
      </View>

      <Text variant="footnote" tone="faint">
        A purchase counts when the price rose before it was disclosed, a sale when it fell. Daily closes,
        split-adjusted
        {timing.sameDay ? `; ${timing.sameDay} trades disclosed the same day are left out` : ''}. Not a measure of
        profit or of intent.
      </Text>
      <NotAdvice />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.xl, padding: 16, gap: 14, borderWidth: StyleSheet.hairlineWidth },
  head: { gap: 2 },
  row: { flexDirection: 'row' },
  cell: { flex: 1, gap: 2, paddingRight: 12 },
  divider: { borderLeftWidth: StyleSheet.hairlineWidth, paddingLeft: 14 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
});
