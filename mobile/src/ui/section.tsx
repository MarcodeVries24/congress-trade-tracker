import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

/** A section title with an optional "See all" on the right. */
export function SectionHeader({
  title,
  subtitle,
  action,
  onAction,
  inset = 20,
}: {
  title: string;
  subtitle?: string;
  action?: string;
  onAction?: () => void;
  inset?: number;
}) {
  const { c } = useTheme();
  return (
    <View style={[styles.row, { paddingHorizontal: inset }]}>
      <View style={styles.text}>
        <Text variant="headline">{title}</Text>
        {subtitle ? (
          <Text variant="caption" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
      {action ? (
        <Tap onPress={onAction} hitSlop={10} scaleTo={0.94}>
          <Text variant="callout" color={c.text} style={styles.action}>
            {action}
          </Text>
        </Tap>
      ) : null}
    </View>
  );
}

/** A group of rows on one white card, as in a settings screen. */
export function Group({ children, title }: { children: ReactNode; title?: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.group}>
      {title ? (
        <Text variant="label" tone="faint" style={styles.groupTitle}>
          {title.toUpperCase()}
        </Text>
      ) : null}
      <View style={[styles.groupCard, { backgroundColor: c.surface, borderColor: c.border }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  text: { flex: 1, gap: 2 },
  action: { fontWeight: '700', textDecorationLine: 'underline' },
  group: { gap: 8 },
  groupTitle: { paddingHorizontal: 4 },
  groupCard: { borderRadius: 18, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
});
