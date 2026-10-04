import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LatestFilingsCard } from '@/components/latest-filing';
import { OnboardingStep, useOnboardingNav } from '@/components/onboarding-step';
import { radius, useTheme } from '@/theme';
import { Icon, type IconName } from '@/ui/icon';
import { Text } from '@/ui/text';
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
  const { answers, finish } = useOnboarding();
  const { c } = useTheme();
  const [stats, setStats] = useState<SiteStats | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchStats({ signal: controller.signal })
      .then(setStats)
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const figures: { value: string; label: string; icon: IconName }[] = [
    {
      value: stats ? stats.totalTransactions.toLocaleString() : '—',
      label: 'disclosed trades',
      icon: 'swap-horizontal',
    },
    { value: stats ? stats.totalMembers.toLocaleString() : '—', label: 'members who file', icon: 'people' },
    { value: stats ? stats.totalFilings.toLocaleString() : '—', label: 'filings read', icon: 'document-text' },
  ];

  return (
    <OnboardingStep
      step={5}
      title="I read every official filing, so you don't have to."
      continueLabel="See the plans"
      onContinue={async () => {
        await finish();
        // Pushed, not replaced, so the plans screen can go back to the steps.
        nav.go('/paywall');
      }}>
      <View style={styles.grid}>
        {figures.map((f) => (
          <View key={f.label} style={[styles.stat, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={[styles.icon, { backgroundColor: c.surfaceMuted }]}>
              <Icon name={f.icon} size={22} color={c.primary} />
            </View>
            <View>
              <Text variant="title">{f.value}</Text>
              <Text variant="caption" tone="muted">
                {f.label}
              </Text>
            </View>
          </View>
        ))}
        {/* Proof the feed is live: the latest filings by whoever was picked, then anyone. */}
        <LatestFilingsCard filedNames={answers.members} />
      </View>
    </OnboardingStep>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 10 },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 16,
  },
  icon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
