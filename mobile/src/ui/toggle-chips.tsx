import { StyleSheet, View } from 'react-native';

import { haptic } from '@/lib/haptics';
import { radius, useTheme } from '@/theme';
import { Icon } from '@/ui/icon';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

/**
 * A wrapping set of chips that toggle. Multi-select by default; with `single`,
 * picking one clears the others and tapping the chosen one clears it, so
 * "any" never needs a chip of its own.
 */
export function ToggleChips({
  options,
  selected,
  onChange,
  single = false,
}: {
  options: readonly { key: string; label: string }[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  single?: boolean;
}) {
  const { c } = useTheme();
  return (
    <View style={styles.wrap}>
      {options.map((o) => {
        const on = selected.includes(o.key);
        return (
          <Tap
            key={o.key}
            scaleTo={0.94}
            onPress={() => {
              haptic.select();
              if (single) onChange(on ? [] : [o.key]);
              else onChange(on ? selected.filter((k) => k !== o.key) : [...selected, o.key]);
            }}
            style={[
              styles.chip,
              on
                ? { backgroundColor: c.primary, borderColor: c.primary }
                : { backgroundColor: c.surface, borderColor: c.border },
            ]}>
            {on && !single ? <Icon name="checkmark" size={14} color={c.primaryText} /> : null}
            <Text variant="callout" color={on ? c.primaryText : c.text} style={styles.label}>
              {o.label}
            </Text>
          </Tap>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  label: { fontWeight: '600' },
});
