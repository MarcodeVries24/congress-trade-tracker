import { memberDisplayName, memberDisplayNameFromFiledName } from '@congtrade/shared/memberDisplay';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { fetchMemberOptions, type MemberOption } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { radius, useTheme } from '@/theme';
import { Icon } from '@/ui/icon';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

/**
 * Picks members by name. The value is filed names, because that is what the
 * trade and alert filters match on exactly, and one person can be filed under
 * several spellings: picking them adds all of those, removing them removes all.
 */
export function MemberPicker({ value, onChange }: { value: string[]; onChange: (names: string[]) => void }) {
  const { c } = useTheme();
  const [options, setOptions] = useState<MemberOption[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetchMemberOptions({ signal: controller.signal })
      .then(setOptions)
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // Chips per person, by display name, so a filed name the options have not
  // loaded yet still shows (and can still be removed).
  const picked = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const n of value) {
      const option = options.find((o) => o.names.includes(n));
      const label = option ? memberDisplayName(option) : memberDisplayNameFromFiledName(n);
      groups.set(label, [...(groups.get(label) ?? []), n]);
    }
    return [...groups.entries()];
  }, [value, options]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return options
      .filter((o) => !o.names.some((n) => value.includes(n)))
      .filter((o) => memberDisplayName(o).toLowerCase().includes(q))
      .slice(0, 6);
  }, [options, query, value]);

  return (
    <View style={styles.wrap}>
      {picked.length ? (
        <View style={styles.tokens}>
          {picked.map(([label, names]) => (
            <Tap
              key={label}
              scaleTo={0.94}
              onPress={() => onChange(value.filter((n) => !names.includes(n)))}
              style={[styles.token, { backgroundColor: c.primary }]}>
              <Text variant="callout" color={c.primaryText} style={styles.bold}>
                {label}
              </Text>
              <Icon name="close" size={14} color={c.primaryText} />
            </Tap>
          ))}
        </View>
      ) : null}
      <View style={[styles.input, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Icon name="search" size={17} color={c.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={picked.length ? 'Add another member' : 'Search members'}
          placeholderTextColor={c.textFaint}
          autoCorrect={false}
          style={[styles.field, { color: c.text }]}
        />
      </View>
      {matches.length ? (
        <View style={[styles.matches, { backgroundColor: c.surface, borderColor: c.border }]}>
          {matches.map((o, i) => (
            <Tap
              key={o.bioguide_id ?? o.member_name}
              scaleTo={0.99}
              onPress={() => {
                haptic.select();
                onChange([...value, ...o.names.filter((n) => !value.includes(n))]);
                setQuery('');
              }}
              style={[
                styles.match,
                i < matches.length - 1 && { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth },
              ]}>
              <Text variant="bodyStrong">{memberDisplayName(o)}</Text>
              <Text variant="caption" tone="muted">
                {o.trade_count.toLocaleString()} trades
              </Text>
            </Tap>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  tokens: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  token: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  bold: { fontWeight: '700' },
  input: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  field: { flex: 1, fontSize: 16, paddingVertical: 13 },
  matches: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  match: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
});
