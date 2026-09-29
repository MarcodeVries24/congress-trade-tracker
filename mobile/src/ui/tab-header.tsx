import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Logo } from '@/ui/logo';
import { Text } from '@/ui/text';

/**
 * The top of every tab: the mark centred, optional actions either side, and a
 * large title with a line under it saying what the screen is for.
 */
export function TabHeader({
  title,
  subtitle,
  left,
  right,
  children,
}: {
  title?: string;
  subtitle?: string;
  left?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 6 }]}>
      <View style={styles.bar}>
        <View style={styles.side}>{left}</View>
        <Logo size={22} />
        <View style={[styles.side, styles.right]}>{right}</View>
      </View>
      {title ? (
        <View style={styles.titles}>
          <Text variant="title">{title}</Text>
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
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    height: 48,
  },
  side: { width: 88, flexDirection: 'row', alignItems: 'center' },
  right: { justifyContent: 'flex-end' },
  titles: { paddingHorizontal: 20, paddingTop: 14, gap: 4 },
});
