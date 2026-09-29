import { useRouter } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/lib/haptics';
import { radius, useTheme } from '@/theme';
import { Button, IconButton } from '@/ui/button';
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
        <Animated.View entering={FadeInDown.duration(380)} style={styles.titles}>
          <Text variant="display">{title}</Text>
          {subtitle ? (
            <Text variant="body" tone="muted">
              {subtitle}
            </Text>
          ) : null}
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
  content: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 28 },
  titles: { gap: 10 },
  body: { marginTop: 26, gap: 12 },
  footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: radius.xl,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  choiceIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  choiceText: { flex: 1, gap: 2 },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
