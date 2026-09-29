import { StyleSheet, View } from 'react-native';

import { radius, useTheme } from '@/theme';
import { Text } from '@/ui/text';

/** A number with its label under it, in a row of three or four. */
export function Stat({ value, label, tone }: { value: string; label: string; tone?: 'gain' | 'loss' }) {
  const { c } = useTheme();
  return (
    <View style={[styles.tile, { backgroundColor: c.surface, borderColor: c.border }]}>
      <Text variant="subhead" tone={tone ?? 'default'} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text variant="footnote" tone="muted" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    flex: 1,
    gap: 2,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
