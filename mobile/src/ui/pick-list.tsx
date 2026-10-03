import { useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import { haptic } from '@/lib/haptics';
import { radius, useTheme } from '@/theme';
import { Icon } from '@/ui/icon';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

export type PickOption = {
  key: string;
  label: string;
  detail?: string;
  /** Lower-case text the search box matches against. */
  search: string;
  leading?: ReactNode;
};

// Rows shown before "Show more", and how many more each tap adds: enough to
// browse the most traded without the filter sheet becoming one long list.
const FIRST = 5;
const MORE = 20;

/**
 * A list to tick, with a search box above it: the members and tickers
 * filters. What was already picked comes first, so it stays in view; rows do
 * not jump while being ticked, since that order is taken once the list loads
 * and again per search. With a query, names that start with it come before
 * ones that only contain it.
 */
export function PickList({
  options,
  isPicked,
  onToggle,
  placeholder,
  loading,
}: {
  options: PickOption[];
  isPicked: (key: string) => boolean;
  onToggle: (key: string) => void;
  placeholder: string;
  loading?: boolean;
}) {
  const { c } = useTheme();
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(FIRST);
  // Taken when the options arrive and whenever the search is cleared, never
  // on a tick: isPicked is read but deliberately not a dependency.
  const loaded = options.length > 0;
  const searching = query.trim() !== '';
  const pinned = useMemo(
    () => new Set(options.filter((o) => isPicked(o.key)).map((o) => o.key)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loaded, searching]
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Picked first, the rest in the order given (most traded first).
      return [...options.filter((o) => pinned.has(o.key)), ...options.filter((o) => !pinned.has(o.key))];
    }
    const found = options.filter((o) => o.search.includes(q));
    const starts = (o: PickOption) => o.label.toLowerCase().startsWith(q);
    return [...found.filter(starts), ...found.filter((o) => !starts(o))];
  }, [options, query, pinned]);

  const visible = matches.slice(0, shown);

  return (
    <View style={styles.wrap}>
      <View style={[styles.input, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Icon name="search" size={17} color={c.textMuted} />
        <TextInput
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            setShown(FIRST);
          }}
          placeholder={placeholder}
          placeholderTextColor={c.textFaint}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          style={[styles.field, { color: c.text }]}
        />
      </View>

      {loading && !options.length ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : visible.length ? (
        <View style={[styles.list, { backgroundColor: c.surface, borderColor: c.border }]}>
          {visible.map((o, i) => {
            const picked = isPicked(o.key);
            return (
              <Tap
                key={o.key}
                scaleTo={0.99}
                onPress={() => {
                  haptic.select();
                  onToggle(o.key);
                }}
                accessibilityState={{ checked: picked }}
                style={[
                  styles.row,
                  i < visible.length - 1 && {
                    borderBottomColor: c.border,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                  },
                ]}>
                {o.leading}
                <View style={styles.text}>
                  <Text variant="bodyStrong" numberOfLines={1}>
                    {o.label}
                  </Text>
                  {o.detail ? (
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {o.detail}
                    </Text>
                  ) : null}
                </View>
                <View
                  style={[
                    styles.check,
                    picked ? { backgroundColor: c.primary, borderColor: c.primary } : { borderColor: c.borderStrong },
                  ]}>
                  {picked ? <Icon name="checkmark" size={14} color={c.primaryText} /> : null}
                </View>
              </Tap>
            );
          })}
        </View>
      ) : (
        <Text variant="callout" tone="muted" style={styles.empty}>
          Nothing matches “{query.trim()}”.
        </Text>
      )}

      {matches.length > shown ? (
        <Tap onPress={() => setShown((n) => n + MORE)} hitSlop={6} style={styles.more}>
          <Text variant="callout" tone="accent" style={styles.bold}>
            Show more ({(matches.length - shown).toLocaleString()})
          </Text>
        </Tap>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  field: { flex: 1, fontSize: 16, paddingVertical: 13 },
  loading: { paddingVertical: 16, alignItems: 'center' },
  list: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  text: { flex: 1, gap: 1 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  empty: { textAlign: 'center', paddingVertical: 8 },
  more: { alignItems: 'center', paddingVertical: 4 },
  bold: { fontWeight: '700' },
});
