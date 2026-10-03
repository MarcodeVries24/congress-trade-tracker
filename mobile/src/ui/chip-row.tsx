import { ScrollView, StyleSheet } from 'react-native';

import { haptic } from '@/lib/haptics';
import { GUTTER, radius, useTheme } from '@/theme';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

/** A scrolling row of single-choice chips: filters and sort orders. */
export function ChipRow<K extends string>({
  options,
  value,
  onChange,
  inset = GUTTER,
}: {
  options: readonly { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  inset?: number;
}) {
  const { c } = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={[styles.row, { paddingHorizontal: inset }]}>
      {options.map((o) => {
        const selected = o.key === value;
        return (
          <Tap
            key={o.key}
            scaleTo={0.95}
            onPress={() => {
              if (!selected) {
                haptic.select();
                onChange(o.key);
              }
            }}
            style={[
              styles.chip,
              selected
                ? { backgroundColor: c.primary, borderColor: c.primary }
                : { backgroundColor: c.surface, borderColor: c.border },
            ]}>
            <Text variant="callout" color={selected ? c.primaryText : c.text} style={styles.label}>
              {o.label}
            </Text>
          </Tap>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.pill, borderWidth: 1 },
  label: { fontWeight: '600' },
});
