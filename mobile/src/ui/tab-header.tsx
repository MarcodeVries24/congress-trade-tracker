import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GUTTER } from '@/theme';
import { Brand } from '@/ui/logo';
import { Text } from '@/ui/text';

/**
 * The top of a tab.
 *
 * Discover, the home screen, carries the brand: the Capitol mark and the
 * wordmark at the left of the page margin, with actions on the right, the way
 * Instagram and Airbnb open. Every other tab opens on its own large title
 * with the actions beside it, as iOS does: one brand on screen at a time,
 * not a wordmark floating over every page.
 */
export function TabHeader({
  title,
  subtitle,
  brand = false,
  right,
  children,
}: {
  title?: string;
  subtitle?: string;
  brand?: boolean;
  right?: ReactNode;
  children?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + (brand ? 4 : 10) }]}>
      {brand ? (
        <View style={styles.bar}>
          <Brand size={21} />
          {right ? <View style={styles.right}>{right}</View> : null}
        </View>
      ) : null}
      {title ? (
        <View style={styles.titles}>
          <View style={styles.titleRow}>
            <Text variant="title" style={styles.flex}>
              {title}
            </Text>
            {!brand && right ? <View style={styles.right}>{right}</View> : null}
          </View>
          {subtitle ? (
            <Text variant="callout" tone="muted">
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: 8 },
  flex: { flex: 1 },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GUTTER,
    height: 48,
  },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  titles: { paddingHorizontal: GUTTER, paddingTop: 6, gap: 4 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
