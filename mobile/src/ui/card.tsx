import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, shadow, useTheme } from '@/theme';
import { Tap } from '@/ui/tap';

/** A white card on the grey page. Tappable when given onPress. */
export function Card({
  children,
  onPress,
  style,
  padded = true,
  elevated = true,
}: {
  children?: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
  elevated?: boolean;
}) {
  const { c, scheme } = useTheme();
  const base = [
    styles.card,
    padded && styles.padded,
    { backgroundColor: c.surface, borderColor: c.border },
    elevated && scheme === 'light' ? shadow.card : null,
    style,
  ];
  if (onPress) {
    return (
      <Tap onPress={onPress} style={base} feedback="tap">
        {children}
      </Tap>
    );
  }
  return <View style={base}>{children}</View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, overflow: 'visible' },
  padded: { padding: 16 },
});
