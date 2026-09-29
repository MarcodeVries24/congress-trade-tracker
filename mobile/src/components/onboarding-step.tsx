import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';

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
}: {
  step: number;
  title: string;
  subtitle?: string;
  children?: ReactNode;
  onContinue: () => void;
  continueLabel?: string;
  canContinue?: boolean;
  skip?: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();

  return (
    <ThemedView style={styles.screen}>
      <View style={[styles.progress, { paddingTop: insets.top + 12 }]}>
        {Array.from({ length: ONBOARDING_STEPS }, (_, i) => (
          <View
            key={i}
            style={[
              styles.pip,
              { backgroundColor: i <= step ? '#3b7ddd' : colors.backgroundElement },
            ]}
          />
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <ThemedText style={styles.title}>{title}</ThemedText>
        {subtitle ? (
          <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</ThemedText>
        ) : null}
        <View style={styles.body}>{children}</View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          disabled={!canContinue}
          onPress={onContinue}
          style={[styles.cta, { backgroundColor: '#3b7ddd', opacity: canContinue ? 1 : 0.4 }]}>
          <ThemedText style={styles.ctaLabel}>{continueLabel}</ThemedText>
        </Pressable>
        {skip ? (
          <Pressable onPress={skip} style={styles.skip}>
            <ThemedText style={[styles.skipLabel, { color: colors.textSecondary }]}>Skip</ThemedText>
          </Pressable>
        ) : null}
      </View>
    </ThemedView>
  );
}

/** A tappable answer. Multi-select shows a tick, single-select just fills. */
export function Choice({
  label,
  hint,
  selected,
  onPress,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.choice,
        {
          backgroundColor: selected ? 'rgba(59,125,221,0.16)' : colors.backgroundElement,
          borderColor: selected ? '#3b7ddd' : 'transparent',
        },
      ]}>
      <View style={styles.choiceText}>
        <ThemedText style={styles.choiceLabel}>{label}</ThemedText>
        {hint ? <ThemedText style={[styles.choiceHint, { color: colors.textSecondary }]}>{hint}</ThemedText> : null}
      </View>
      {selected ? <ThemedText style={styles.tick}>✓</ThemedText> : null}
    </Pressable>
  );
}

/** Advances the flow without each screen knowing the order by heart. */
export function useOnboardingNav() {
  const router = useRouter();
  return {
    go: (path: string) => router.push(path as never),
    replace: (path: string) => router.replace(path as never),
  };
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  progress: { flexDirection: 'row', gap: 6, paddingHorizontal: 24, paddingBottom: 8 },
  pip: { flex: 1, height: 4, borderRadius: 2 },
  content: { paddingHorizontal: 24, paddingTop: 20, paddingBottom: 24 },
  title: { fontSize: 26, fontWeight: '700', lineHeight: 32 },
  subtitle: { marginTop: 8, fontSize: 15, lineHeight: 21 },
  body: { marginTop: 24, gap: 10 },
  footer: { paddingHorizontal: 24, paddingTop: 8, gap: 4 },
  cta: { alignItems: 'center', borderRadius: 14, paddingVertical: 16 },
  ctaLabel: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
  skip: { alignItems: 'center', paddingVertical: 10 },
  skipLabel: { fontSize: 14 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  choiceText: { flex: 1, gap: 2 },
  choiceLabel: { fontSize: 15, fontWeight: '600' },
  choiceHint: { fontSize: 13, lineHeight: 18 },
  tick: { fontSize: 16, fontWeight: '700', color: '#3b7ddd' },
});
