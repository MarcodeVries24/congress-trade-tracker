import { useEffect, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { haptic } from '@/lib/haptics';
import { radius, useTheme } from '@/theme';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

/**
 * Two or three mutually exclusive views, with a navy thumb that slides to the
 * chosen one. The All / Watchlist switch on Politicians.
 */
export function Segmented<K extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
}) {
  const { c } = useTheme();
  const [width, setWidth] = useState(0);
  const index = Math.max(
    0,
    options.findIndex((o) => o.key === value)
  );
  const segment = width ? (width - 8) / options.length : 0;
  const x = useSharedValue(0);

  useEffect(() => {
    x.set(withSpring(index * segment, { damping: 20, stiffness: 220 }));
  }, [index, segment, x]);

  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={[styles.track, { backgroundColor: c.surfaceMuted }]}>
      {segment ? <Animated.View style={[styles.thumb, { width: segment, backgroundColor: c.primary }, thumb]} /> : null}
      {options.map((o) => {
        const selected = o.key === value;
        return (
          <Tap
            key={o.key}
            scaleTo={0.98}
            onPress={() => {
              if (!selected) {
                haptic.select();
                onChange(o.key);
              }
            }}
            style={styles.option}>
            <Text variant="callout" color={selected ? c.primaryText : c.textMuted} style={styles.label}>
              {o.label}
            </Text>
          </Tap>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: radius.pill, padding: 4, position: 'relative' },
  thumb: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: radius.pill },
  option: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  label: { fontWeight: '700' },
});
