import { useNavigation, useRouter } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/lib/haptics';
import { radius, useTheme } from '@/theme';
import { Button, IconButton } from '@/ui/button';
import { CongBadge } from '@/ui/cong-mascot';
import { Icon, type IconName } from '@/ui/icon';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

export const ONBOARDING_STEPS = 5;

// Where each step's back arrow leads, by step number: step 1 goes back to the
// welcome screen.
const STEP_ROUTES = [
  '/onboarding',
  '/onboarding/goal',
  '/onboarding/chamber',
  '/onboarding/members',
  '/onboarding/notify',
  '/onboarding/proof',
] as const;

/**
 * Back to the step before `step`, even with no history to go back through:
 * a step opened by a link or at launch still leads to the one before it.
 * Pass `ONBOARDING_STEPS + 1` from the plans screen, which follows the last
 * step.
 */
export function useStepBack(step: number) {
  const router = useRouter();
  const navigation = useNavigation();
  return () => {
    const state = navigation.getState();
    const below = state?.routes[state.index - 1]?.name;
    // Below the plans screen can be the app itself, which would send the
    // paywall straight back here; only the steps count as somewhere to return.
    const fromHistory = state?.routes[state.index].name === 'paywall' ? below === 'onboarding' : !!below;
    if (fromHistory) router.back();
    else router.replace(STEP_ROUTES[step - 1] as never);
  };
}

/**
 * The frame every onboarding question sits in.
 *
 * One component rather than five copies, so the progress bar, the spacing and
 * the position of the continue button cannot drift between steps. A flow where
 * the button moves between screens feels broken even when nothing is.
 *
 * Cong, the mascot, asks each question from a speech bubble at the top, so
 * the flow reads as one guide talking you through it rather than a form. The
 * question is the bubble's whole text, with at most a short line under it;
 * each step is meant to fit on one screen.
 */
export function OnboardingStep({
  step,
  title,
  subtitle,
  children,
  onContinue,
  continueLabel = 'Continue',
  canContinue = true,
  skip,
  back = true,
}: {
  step: number;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  onContinue: () => void;
  continueLabel?: string;
  canContinue?: boolean;
  skip?: () => void;
  back?: boolean;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const goBack = useStepBack(step);
  const progress = useSharedValue(Math.max(0, step - 1) / ONBOARDING_STEPS);

  useEffect(() => {
    progress.set(withTiming(step / ONBOARDING_STEPS, { duration: 450 }));
  }, [step, progress]);

  const fill = useAnimatedStyle(() => ({ width: `${Math.min(1, progress.value) * 100}%` }));

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        {back ? (
          <IconButton name="chevron-back" label="Back" onPress={goBack} size={36} />
        ) : (
          <View style={styles.slot} />
        )}
        <View style={[styles.track, { backgroundColor: c.surfaceMuted }]}>
          <Animated.View style={[styles.fill, { backgroundColor: c.accent }, fill]} />
        </View>
        {skip ? (
          <Tap onPress={skip} hitSlop={10}>
            <Text variant="callout" tone="muted" style={styles.skip}>
              Skip
            </Text>
          </Tap>
        ) : (
          <View style={styles.slot} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <CongSays title={title} subtitle={subtitle} />
        <Animated.View entering={FadeInDown.duration(420).delay(80)} style={styles.body}>
          {children}
        </Animated.View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + 14, borderTopColor: c.border, backgroundColor: c.background },
        ]}>
        <Button label={continueLabel} onPress={onContinue} disabled={!canContinue} />
      </View>
    </View>
  );
}

/**
 * Cong asking something from a speech bubble: the head of every setup step
 * and of the plans screen, drawn by this one component so he sits in the same
 * place on each.
 */
export function CongSays({ title, subtitle }: { title: string; subtitle?: string }) {
  const { c } = useTheme();
  return (
    <Animated.View entering={FadeInDown.duration(380)} style={styles.guide}>
      <CongBadge width={52} wave={false} halo={c.accentSoft} />
      <View style={[styles.bubble, { backgroundColor: c.surface, borderColor: c.border }]}>
        {/* The bubble's tail, pointing at Cong. */}
        <View style={[styles.tail, { backgroundColor: c.surface, borderColor: c.border }]} />
        <Text variant="headline">{title}</Text>
        {subtitle ? (
          <Text variant="callout" tone="muted">
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Animated.View>
  );
}

/**
 * The space a setup step's top bar takes (back, progress, skip), for a screen
 * without one that should still put Cong at the same height.
 */
export const STEP_TOP_BAR = { paddingTop: 8, row: 36, paddingBottom: 8 };

/** A tappable answer card. Selected fills navy-tinted with a check. */
export function Choice({
  label,
  hint,
  selected,
  onPress,
  icon,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconName;
}) {
  const { c } = useTheme();
  return (
    <Tap
      onPress={() => {
        haptic.select();
        onPress();
      }}
      scaleTo={0.98}
      style={[
        styles.choice,
        {
          backgroundColor: c.surface,
          borderColor: selected ? c.primary : c.border,
          borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
        },
      ]}>
      {icon ? (
        <View style={[styles.choiceIcon, { backgroundColor: selected ? c.primary : c.surfaceMuted }]}>
          <Icon name={icon} size={22} color={selected ? c.primaryText : c.text} />
        </View>
      ) : null}
      <View style={styles.choiceText}>
        <Text variant="bodyStrong">{label}</Text>
        {hint ? (
          <Text variant="caption" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      <View
        style={[
          styles.check,
          selected ? { backgroundColor: c.primary, borderColor: c.primary } : { borderColor: c.borderStrong },
        ]}>
        {selected ? <Icon name="checkmark" size={15} color={c.primaryText} /> : null}
      </View>
    </Tap>
  );
}

/** Advances the flow without each screen knowing the order by heart. */
export function useOnboardingNav() {
  const router = useRouter();
  return {
    go: (path: string) => {
      haptic.tap();
      router.push(path as never);
    },
    replace: (path: string) => router.replace(path as never),
  };
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingBottom: 8 },
  // Holds the bar's height when there is no back button or Skip, so Cong
  // sits at the same height on every step.
  slot: { width: 36, height: 36 },
  track: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  skip: { fontWeight: '600' },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 24 },
  guide: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  bubble: {
    flex: 1,
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tail: {
    position: 'absolute',
    left: -6,
    top: '50%',
    marginTop: -6,
    width: 12,
    height: 12,
    transform: [{ rotate: '45deg' }],
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  body: { marginTop: 22, gap: 10 },
  footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: radius.xl,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  choiceIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  choiceText: { flex: 1, gap: 2 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
