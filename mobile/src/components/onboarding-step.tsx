import { useRouter } from 'expo-router';
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
  const router = useRouter();
  const progress = useSharedValue(Math.max(0, step - 1) / ONBOARDING_STEPS);

  useEffect(() => {
    progress.set(withTiming(step / ONBOARDING_STEPS, { duration: 450 }));
  }, [step, progress]);

  const fill = useAnimatedStyle(() => ({ width: `${Math.min(1, progress.value) * 100}%` }));

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
        {back && router.canGoBack() ? (
          <IconButton name="chevron-back" label="Back" onPress={() => router.back()} size={36} />
        ) : (
          <View style={{ width: 36 }} />
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
          <View style={{ width: 36 }} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
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
