import { Pressable, ScrollView, StyleSheet, useColorScheme } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';

/**
 * A row of single-choice pills: chamber, sort order. The same look as the
 * chamber switch on the trades feed, so every filter in the app reads alike.
 */
export function Chips<K extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
}) {
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {options.map((o) => {
        const selected = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[styles.chip, { backgroundColor: selected ? colors.backgroundSelected : colors.backgroundElement }]}>
            <ThemedText style={[styles.label, { color: selected ? colors.text : colors.textSecondary }]}>
              {o.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: 16 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999 },
  label: { fontSize: 13, fontWeight: '600' },
});
