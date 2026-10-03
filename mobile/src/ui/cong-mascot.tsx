import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Ellipse, G, Path, Polygon, Rect } from 'react-native-svg';

/**
 * Cong, the CongTrade mascot: a monkey in a blue blazer and navy tie who
 * guides people through the welcome screens (design handoff "3a Suit & wave").
 *
 * Drawn from the handoff's geometry, a 100 × 140 unit canvas where one unit
 * is width / 100, as a few SVG layers stacked in views, so the parts that move
 * (the whole body floating, the head nodding, the eyes blinking, the right arm
 * waving, the tail swinging) can each turn about their own pivot. With the
 * system's reduce-motion setting on he stands still, arm raised.
 *
 * `wave` false rests the right arm at the side, mirroring the left, for the
 * smaller guide on the question screens where a constant wave would distract.
 */

export const CONG = {
  navy: '#101A2E',
  blue: '#0A87CB',
  cream: '#F4EFE8',
  white: '#FFFFFF',
  blush: '#F29C9C',
};

const RAISED = -125;
const RESTING = -14;
const EASE = Easing.inOut(Easing.ease);

export function CongMascot({ width = 190, wave = true }: { width?: number; wave?: boolean }) {
  const u = width / 100;
  const height = width * 1.4;
  const reduce = useReducedMotion();

  const float = useSharedValue(0);
  const nod = useSharedValue(0);
  const blink = useSharedValue(1);
  const arm = useSharedValue(wave ? RAISED : RESTING);
  const tail = useSharedValue(-10);

  useEffect(() => {
    arm.set(wave ? RAISED : RESTING);
    if (reduce) return;
    float.set(withRepeat(withSequence(withTiming(1, { duration: 1800, easing: EASE }), withTiming(0, { duration: 1800, easing: EASE })), -1));
    // Three legs of the nod, mapped to position and tilt below.
    nod.set(
      withRepeat(
        withSequence(
          withTiming(1, { duration: 1800, easing: EASE }),
          withTiming(2, { duration: 1800, easing: EASE }),
          withTiming(3, { duration: 2400, easing: EASE })
        ),
        -1
      )
    );
    blink.set(withRepeat(withSequence(withDelay(3864, withTiming(0.1, { duration: 126 })), withTiming(1, { duration: 210 })), -1));
    tail.set(withRepeat(withSequence(withTiming(8, { duration: 1200, easing: EASE }), withTiming(-10, { duration: 1200, easing: EASE })), -1));
    if (wave) {
      arm.set(withRepeat(withSequence(withTiming(-150, { duration: 800, easing: EASE }), withTiming(RAISED, { duration: 800, easing: EASE })), -1));
    }
    return () => {
      [float, nod, blink, arm, tail].forEach((v) => cancelAnimation(v));
    };
  }, [reduce, wave, float, nod, blink, arm, tail]);

  const bodyStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -0.06 * height * float.get() }] }));
  const headStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(nod.get(), [0, 1, 2, 3], [0, 0.015 * 74 * u, 0, 0]) },
      { rotate: `${interpolate(nod.get(), [0, 1, 2, 3], [0, -2, 1.5, 0])}deg` },
    ],
  }));
  const eyeStyle = useAnimatedStyle(() => ({ transform: [{ scaleY: blink.get() }] }));
  const armStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${arm.get()}deg` }] }));
  const tailStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${tail.get()}deg` }] }));

  // A box on the 100 × 140 grid, in points.
  const box = (x: number, y: number, w: number, h: number) => ({
    position: 'absolute' as const,
    left: x * u,
    top: y * u,
    width: w * u,
    height: h * u,
  });

  const eye = (x: number) => (
    <Animated.View style={[box(x, 33, 9, 10), eyeStyle]}>
      <Svg width="100%" height="100%" viewBox="0 0 9 10">
        <Ellipse cx={4.5} cy={5} rx={4.5} ry={5} fill={CONG.navy} />
        <Circle cx={6.5} cy={3.3} r={1.5} fill={CONG.white} />
      </Svg>
    </Animated.View>
  );

  return (
    <Animated.View style={[{ width, height }, bodyStyle]} accessibilityLabel="Cong, the CongTrade monkey" accessible>
      {/* 1. Tail, behind everything, swinging about its base. */}
      <Animated.View style={[box(60, 84, 30, 30), { transformOrigin: '20% 80%' }, tailStyle]}>
        <Svg width="100%" height="100%" viewBox="0 0 30 30">
          <Path d="M6.16 6.16 A12.5 12.5 0 0 1 23.84 23.84" stroke={CONG.navy} strokeWidth={5} fill="none" />
        </Svg>
      </Animated.View>

      {/* 2–7. Legs, feet, blazer, shirt, tie and the resting left arm. */}
      <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 140">
        <Rect x={35} y={110} width={12} height={20} rx={5} fill={CONG.navy} />
        <Rect x={53} y={110} width={12} height={20} rx={5} fill={CONG.navy} />
        <Ellipse cx={40} cy={130.5} rx={9} ry={4.5} fill={CONG.cream} />
        <Ellipse cx={60} cy={130.5} rx={9} ry={4.5} fill={CONG.cream} />
        <Path
          d="M47 70 H53 A20 20 0 0 1 73 90 V102 A14 14 0 0 1 59 116 H41 A14 14 0 0 1 27 102 V90 A20 20 0 0 1 47 70 Z"
          fill={CONG.blue}
        />
        <Polygon points="40,70 60,70 50,88" fill={CONG.white} />
        <Rect x={48} y={72} width={4} height={18} rx={1.5} fill={CONG.navy} />
        <G transform="rotate(14 22.5 77)">
          <Rect x={17} y={74} width={11} height={26} rx={5.5} fill={CONG.blue} />
          <Circle cx={22.5} cy={102} r={6} fill={CONG.cream} />
        </G>
      </Svg>

      {/* 8. The head, nodding about its chin. */}
      <Animated.View style={[box(0, 0, 100, 74), { transformOrigin: '50% 90%' }, headStyle]}>
        <Svg style={StyleSheet.absoluteFill} viewBox="0 0 100 74">
          <Circle cx={16} cy={40} r={12} fill={CONG.navy} />
          <Circle cx={16} cy={40} r={6} fill={CONG.cream} />
          <Circle cx={84} cy={40} r={12} fill={CONG.navy} />
          <Circle cx={84} cy={40} r={6} fill={CONG.cream} />
          <Circle cx={50} cy={10} r={7} fill={CONG.navy} />
          <Ellipse cx={50} cy={40} rx={34} ry={32} fill={CONG.navy} />
          <Circle cx={38.5} cy={37.5} r={13.5} fill={CONG.cream} />
          <Circle cx={61.5} cy={37.5} r={13.5} fill={CONG.cream} />
          <Ellipse cx={50} cy={52.5} rx={23} ry={14.5} fill={CONG.cream} />
          <Ellipse cx={47} cy={50.2} rx={1.5} ry={1.2} fill={CONG.navy} />
          <Ellipse cx={53} cy={50.2} rx={1.5} ry={1.2} fill={CONG.navy} />
          <Path d="M43 52 A7 7 0 0 0 57 52" stroke={CONG.navy} strokeWidth={2} fill="none" strokeLinecap="round" />
          <Ellipse cx={33} cy={52.5} rx={4} ry={2.5} fill={CONG.blush} opacity={0.45} />
          <Ellipse cx={67} cy={52.5} rx={4} ry={2.5} fill={CONG.blush} opacity={0.45} />
        </Svg>
        {eye(34)}
        {eye(57)}
      </Animated.View>

      {/* 9. The right arm, in front of the head, waving about the shoulder. */}
      <Animated.View style={[box(75, 74, 13, 35), { transformOrigin: '50% 8.6%' }, armStyle]}>
        <Svg width="100%" height="100%" viewBox="0 0 13 35">
          <Rect x={1} y={0} width={11} height={26} rx={5.5} fill={CONG.blue} />
          <Circle cx={6.5} cy={28} r={6} fill={CONG.cream} />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * Cong on a soft disc, so his navy fur stays visible on the dark theme's page
 * and he reads as one figure on the light one.
 */
export function CongBadge({ width, wave, halo }: { width: number; wave?: boolean; halo: string }) {
  const size = width * 1.55;
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: halo }]}>
      <CongMascot width={width} wave={wave} />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' },
});
