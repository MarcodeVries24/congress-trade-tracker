import { getProPricing } from '@congtrade/shared/plans';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';

type Period = 'weekly' | 'monthly' | 'annual';

/**
 * The paywall.
 *
 * Weekly is preselected because it is what someone who has just met the app
 * will commit to, and the longer plans carry the saving so they argue for
 * themselves rather than being buried.
 *
 * Nothing here charges anything yet. StoreKit and Play Billing are the next
 * step, and until they land the button says so instead of pretending: an app
 * that takes a tap and does nothing is worse than one that admits it.
 *
 * Prices come from @congtrade/shared so the app, the website and Stripe cannot
 * disagree about what Pro costs. The store products must be created with the
 * same figures, which is the one place this can still drift.
 */
export default function PaywallScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Euros until the store tells us the buyer's storefront. The shared module
  // decides by country on the website; on a phone the store is the authority,
  // and asking it is part of wiring up the purchase.
  const pricing = getProPricing('eur');
  const [period, setPeriod] = useState<Period>('weekly');

  const plans: { key: Period; title: string; price: string; note: string; badge?: string }[] = [
    {
      key: 'weekly',
      title: 'Weekly',
      price: `${pricing.currencySymbol}${pricing.weekly}`,
      note: 'per week, cancel any time',
    },
    {
      key: 'monthly',
      title: 'Monthly',
      price: `${pricing.currencySymbol}${pricing.monthly}`,
      note: 'per month',
      badge: pricing.monthlySavingVsWeeklyPercent ? `Save ${pricing.monthlySavingVsWeeklyPercent}%` : undefined,
    },
    {
      key: 'annual',
      title: 'Yearly',
      price: `${pricing.currencySymbol}${pricing.annualMonthly}`,
      note: `per month, billed as ${pricing.currencySymbol}${pricing.annualTotal}`,
      badge: pricing.annualSavingPercent ? `Save ${pricing.annualSavingPercent}%` : undefined,
    },
  ];

  return (
    <ThemedView style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 24 }]}>
        <ThemedText style={styles.title}>CongTrade Pro</ThemedText>
        <ThemedText style={[styles.subtitle, { color: colors.textSecondary }]}>
          Filter the whole archive, and get told the moment a filing matches what you picked.
        </ThemedText>

        <View style={styles.plans}>
          {plans.map((p) => {
            const selected = period === p.key;
            return (
              <Pressable
                key={p.key}
                onPress={() => setPeriod(p.key)}
                style={[
                  styles.plan,
                  {
                    backgroundColor: selected ? 'rgba(59,125,221,0.16)' : colors.backgroundElement,
                    borderColor: selected ? '#3b7ddd' : 'transparent',
                  },
                ]}>
                <View style={styles.planText}>
                  <View style={styles.planHeader}>
                    <ThemedText style={styles.planTitle}>{p.title}</ThemedText>
                    {p.badge ? (
                      <View style={styles.badge}>
                        <ThemedText style={styles.badgeLabel}>{p.badge}</ThemedText>
                      </View>
                    ) : null}
                  </View>
                  <ThemedText style={[styles.planNote, { color: colors.textSecondary }]}>{p.note}</ThemedText>
                </View>
                <ThemedText style={styles.planPrice}>{p.price}</ThemedText>
              </Pressable>
            );
          })}
        </View>

        {/* Apple's guideline 3.1.2 wants the length, the price per period and
            links to the terms on the paywall itself, and a restore control. */}
        <ThemedText style={[styles.legal, { color: colors.textSecondary }]}>
          Subscriptions renew automatically until cancelled. Cancel any time in your account. By subscribing you agree
          to the Terms of Service and the Privacy Policy at congtrade.com.
        </ThemedText>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable disabled style={[styles.cta, { backgroundColor: '#3b7ddd', opacity: 0.45 }]}>
          <ThemedText style={styles.ctaLabel}>In-app purchase not wired up yet</ThemedText>
        </Pressable>
        <Pressable onPress={() => router.replace('/(tabs)')} style={styles.secondary}>
          <ThemedText style={[styles.secondaryLabel, { color: colors.textSecondary }]}>
            Skip for now, look around
          </ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 24, paddingBottom: 24 },
  title: { fontSize: 30, fontWeight: '700' },
  subtitle: { marginTop: 8, fontSize: 15, lineHeight: 21 },
  plans: { marginTop: 26, gap: 10 },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  planText: { flex: 1, gap: 3 },
  planHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planTitle: { fontSize: 16, fontWeight: '700' },
  badge: { backgroundColor: '#3b7ddd', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeLabel: { fontSize: 11, fontWeight: '700', color: '#ffffff' },
  planNote: { fontSize: 13 },
  planPrice: { fontSize: 18, fontWeight: '700' },
  legal: { marginTop: 22, fontSize: 12, lineHeight: 17 },
  footer: { paddingHorizontal: 24, paddingTop: 8, gap: 2 },
  cta: { alignItems: 'center', borderRadius: 14, paddingVertical: 16 },
  ctaLabel: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
  secondary: { alignItems: 'center', paddingVertical: 12 },
  secondaryLabel: { fontSize: 14 },
});
