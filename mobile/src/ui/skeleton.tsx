import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { radius, useTheme } from '@/theme';

/** A grey block that breathes while its content loads. Better than a spinner in a list. */
export function Skeleton({
  width = '100%',
  height = 14,
  round = radius.sm,
}: {
  width?: DimensionValue;
  height?: number;
  round?: number;
}) {
  const { c } = useTheme();
  const opacity = useSharedValue(0.55);
  useEffect(() => {
    opacity.set(withRepeat(withTiming(1, { duration: 750 }), -1, true));
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[{ width, height, borderRadius: round, backgroundColor: c.skeleton }, style]} />;
}

/** The shape of a trade or member row, drawn while the real ones load. */
export function RowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.row}>
          <Skeleton width={46} height={46} round={23} />
          <View style={styles.text}>
            <Skeleton width="55%" height={14} />
            <Skeleton width="80%" height={12} />
          </View>
          <Skeleton width={54} height={22} round={11} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 20, gap: 22, paddingTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  text: { flex: 1, gap: 8 },
});
