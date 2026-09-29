import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';
import { Text } from '@/ui/text';

/** Buys against sells, as one bar with the share of buys spelled out. */
export function SentimentBar({
  buys,
  sells,
  showLabels = true,
}: {
  buys: number;
  sells: number;
  showLabels?: boolean;
}) {
  const { c } = useTheme();
  const total = buys + sells;
  const share = total ? buys / total : 0.5;
  return (
    <View style={styles.wrap}>
      <View style={[styles.track, { backgroundColor: c.surfaceMuted }]}>
        <View style={[styles.buy, { flex: share, backgroundColor: c.gain }]} />
        <View style={[styles.sell, { flex: 1 - share, backgroundColor: c.loss }]} />
      </View>
      {showLabels ? (
        <View style={styles.labels}>
          <Text variant="footnote" tone="gain">
            {buys.toLocaleString()} bought
          </Text>
          <Text variant="footnote" tone="loss">
            {sells.toLocaleString()} sold
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  track: { flexDirection: 'row', height: 6, borderRadius: 3, overflow: 'hidden', gap: 2 },
  buy: { borderRadius: 3 },
  sell: { borderRadius: 3 },
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
});
