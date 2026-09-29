import { useEffect, useState } from 'react';
import { StyleSheet, View, useColorScheme } from 'react-native';

import { OnboardingStep, useOnboardingNav } from '@/components/onboarding-step';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { fetchStats, type SiteStats } from '@/lib/api';
import { useOnboarding } from '@/lib/onboarding';

/**
 * The last screen before the paywall, and the only one that argues.
 *
 * The numbers are fetched rather than written down, because a hardcoded
 * "65,000+ trades" is a claim that quietly goes stale and a fetched one cannot.
 */
export default function ProofScreen() {
  const nav = useOnboardingNav();
  const { finish } = useOnboarding();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const [stats, setStats] = useState<SiteStats | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchStats({ signal: controller.signal }).then(setStats).catch(() => {});
    return () => controller.abort();
  }, []);

  const figures = [
    { value: stats ? stats.totalTransactions.toLocaleString() : '—', label: 'disclosed trades' },
    { value: stats ? stats.totalMembers.toLocaleString() : '—', label: 'members who file' },
    { value: stats ? stats.totalFilings.toLocaleString() : '—', label: 'filings read' },
  ];

  return (
    <OnboardingStep
      step={5}
      title="Built from the filings, not from a feed"
      subtitle="Every figure below comes from documents the House Clerk and the Senate published. Where we can, we link you to the original."
      continueLabel="See the plans"
      onContinue={async () => {
        await finish();
        nav.replace('/paywall');
      }}>
      <View style={styles.grid}>
        {figures.map((f) => (
          <View key={f.label} style={[styles.stat, { backgroundColor: colors.backgroundElement }]}>
            <ThemedText style={styles.value}>{f.value}</ThemedText>
            <ThemedText style={[styles.label, { color: colors.textSecondary }]}>{f.label}</ThemedText>
          </View>
        ))}
      </View>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 10 },
  stat: { borderRadius: 14, paddingHorizontal: 18, paddingVertical: 16, gap: 2 },
  value: { fontSize: 24, fontWeight: '700' },
  label: { fontSize: 13 },
});
