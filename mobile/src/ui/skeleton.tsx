import { LinearGradient } from 'expo-linear-gradient';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { radius, type, useTheme, type TypeVariant } from '@/theme';

/**
 * Loading placeholders.
 *
 * One soft band of light sweeps across a whole placeholder, left to right,
 * rather than every grey block breathing in and out on its own, which read as
 * flicker. The shapes themselves stay still. Anyone who has asked their phone
 * for less motion gets the shapes without the band.
 */

// Inside a Shimmer, a Skeleton is a plain shape and the Shimmer draws the one
// band over all of them. On its own, a Skeleton carries its own band.
const InShimmer = createContext(false);

const SWEEP_MS = 1500;

export function Shimmer({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { scheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!width || reduceMotion) return;
    progress.set(0);
    progress.set(withRepeat(withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.ease) }), -1, false));
  }, [width, reduceMotion, progress]);

  // The band is half the width of what it crosses, and travels from fully
  // off the left edge to fully off the right one.
  const band = Math.max(120, width * 0.5);
  const sweep = useAnimatedStyle(() => ({
    transform: [{ translateX: -band + progress.value * (width + band) }],
  }));
  const shine = scheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.7)';
  // Clear white at the edges, not 'transparent': that is clear *black*, and a
  // gradient from it to white passes through grey, which drew a dirty band.
  const clear = 'rgba(255,255,255,0)';

  return (
    <View
      style={[styles.clip, style]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <InShimmer.Provider value>{children}</InShimmer.Provider>
      {width > 0 && !reduceMotion ? (
        <Animated.View pointerEvents="none" style={[styles.band, { width: band }, sweep]}>
          <LinearGradient
            colors={[clear, shine, clear]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** One grey shape, standing in for something that is loading. */
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
  const shape = <View style={{ width, height, borderRadius: round, backgroundColor: c.skeleton }} />;
  if (useContext(InShimmer)) return shape;
  return (
    <Shimmer style={{ width, height, borderRadius: round }}>
      {shape}
    </Shimmer>
  );
}

/**
 * A line of text in outline: as tall as a line of that text style, so a
 * placeholder row is exactly as tall as the row it stands in for, with the
 * grey bar about as tall as the letters rather than the whole line.
 */
export function SkeletonLine({ variant, width }: { variant: TypeVariant; width: DimensionValue }) {
  const { c } = useTheme();
  const { lineHeight, fontSize } = type[variant];
  const bar = Math.round(fontSize * 0.78);
  return (
    <View style={{ height: lineHeight, justifyContent: 'center' }}>
      <View style={{ width, height: bar, borderRadius: radius.sm / 2 + 2, backgroundColor: c.skeleton }} />
    </View>
  );
}

// Varied, so a list of placeholders reads as names and companies rather than
// a stack of identical bars.
const NAME = ['46%', '58%', '40%', '52%', '44%', '62%', '50%'] as const;
const ASSET = ['70%', '54%', '78%', '62%', '74%', '58%', '66%'] as const;
const AMOUNT = ['40%', '46%', '36%', '44%', '40%', '48%', '38%'] as const;

/**
 * TradeRow in outline, piece for piece: the photo, the member, what they did,
 * the amount, and the pill and the date on the right, at the same sizes and
 * with the same dividers. The list is already the height it will be, so
 * nothing below it moves when the trades arrive.
 */
export function TradeRowSkeleton({ count = 5 }: { count?: number }) {
  const { c } = useTheme();
  return (
    <Shimmer>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.tradeRow}>
          <Skeleton width={48} height={48} round={24} />
          <View
            style={[
              styles.tradeBody,
              i < count - 1 && { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth },
            ]}>
            <View style={styles.tradeText}>
              <SkeletonLine variant="bodyStrong" width={NAME[i % NAME.length]} />
              <SkeletonLine variant="callout" width={ASSET[i % ASSET.length]} />
              <SkeletonLine variant="caption" width={AMOUNT[i % AMOUNT.length]} />
            </View>
            <View style={styles.tradeSide}>
              {/* The pill's own padding around a line of its text. */}
              <View style={[styles.pill, { backgroundColor: c.skeleton }]}>
                <View style={{ width: 44, height: type.footnote.lineHeight }} />
              </View>
              <SkeletonLine variant="footnote" width={44} />
            </View>
          </View>
        </View>
      ))}
    </Shimmer>
  );
}

/** The shape of a member or company row, drawn while the real ones load. */
export function RowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <Shimmer style={styles.list}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={styles.row}>
          <Skeleton width={46} height={46} round={23} />
          <View style={styles.text}>
            <SkeletonLine variant="bodyStrong" width={NAME[i % NAME.length]} />
            <SkeletonLine variant="caption" width={ASSET[i % ASSET.length]} />
          </View>
          <Skeleton width={54} height={22} round={11} />
        </View>
      ))}
    </Shimmer>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  band: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  list: { paddingHorizontal: 16, gap: 22, paddingTop: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  text: { flex: 1, gap: 4 },
  // These four mirror TradeRow's own styles.
  tradeRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingLeft: 16 },
  tradeBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 16, paddingRight: 16 },
  tradeText: { flex: 1, gap: 3 },
  tradeSide: { alignItems: 'flex-end', gap: 6 },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
});
