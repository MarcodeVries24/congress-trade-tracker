import { getProPricing } from '@congtrade/shared/plans';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import type { BillingPeriod } from '@/lib/products';
import { usePurchases } from '@/lib/use-purchases';

/**
 * The paywall.
 *
 * Weekly is preselected because it is what someone who has just met the app
 * will commit to, and the longer plans carry the saving so they argue for
 * themselves rather than being buried.
 *
 * Prices come from the store, not from us. Apple's matrix turns 4.99 euro into
 * $4.99 in the US and A$7.99 in Australia, and the paywall has to show what
 * will be charged. @congtrade/shared is the fallback for the web preview, which
 * has no store to ask, and stays the figure typed into the two consoles.
 *
 * The purchase itself is reported to the server, which asks Apple what it was.
 * Nothing on this screen decides whether anyone is entitled to anything.
 */
export default function PaywallScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Only a fallback now: the store answers with the real localised figure.
  const pricing = getProPricing('eur');
  const [period, setPeriod] = useState<BillingPeriod>('weekly');
  const purchases = usePurchases(useCallback(() => router.replace('/(tabs)'), [router]));

  // The store's price whenever there is one. Apple's matrix turns 4.99 euro
  // into $4.99 in the US and A$7.99 in Australia, and the paywall must show
  // what will actually be charged. Ours is the fallback for the web preview,
  // where there is no store to ask.
  const storePrice = (p: BillingPeriod) => purchases.products.find((x) => x.period === p)?.displayPrice;

  const plans: { key: BillingPeriod; title: string; price: string; note: string; badge?: string }[] = [
    {
      key: 'weekly',
      title: 'Weekly',
      price: storePrice('weekly') ?? `${pricing.currencySymbol}${pricing.weekly}`,
      note: 'per week, cancel any time',
    },
    {
      key: 'monthly',
      title: 'Monthly',
      price: storePrice('monthly') ?? `${pricing.currencySymbol}${pricing.monthly}`,
      note: 'per month',
      badge: pricing.monthlySavingVsWeeklyPercent ? `Save ${pricing.monthlySavingVsWeeklyPercent}%` : undefined,
    },
    {
      key: 'annual',
      title: 'Yearly',
      price: storePrice('annual') ?? `${pricing.currencySymbol}${pricing.annualTotal}`,
      note: 'per year',
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
        {purchases.error ? <ThemedText style={styles.error}>{purchases.error}</ThemedText> : null}
        <Pressable
          disabled={!purchases.available || purchases.busy !== null}
          onPress={() => purchases.buy(period)}
          style={[
            styles.cta,
            { backgroundColor: '#3b7ddd', opacity: purchases.available && !purchases.busy ? 1 : 0.45 },
          ]}>
          {purchases.busy ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <ThemedText style={styles.ctaLabel}>
              {purchases.available ? 'Subscribe' : 'Not available on the web preview'}
            </ThemedText>
          )}
        </Pressable>

        {/* Apple requires a visible way to restore a purchase; an app without
            one is rejected, and rightly, because someone who has paid and
            reinstalled has no other route back in. */}
        {purchases.available ? (
          <Pressable onPress={() => purchases.restore()} style={styles.secondary}>
            <ThemedText style={[styles.secondaryLabel, { color: colors.textSecondary }]}>
              Restore purchases
            </ThemedText>
          </Pressable>
        ) : null}

        {/* The only way into the account screen before subscribing. Someone
            who already pays on the website, and a store reviewer holding a
            test login, both arrive here with nothing to buy. */}
        <Pressable onPress={() => router.push('/sign-in')} style={styles.secondary}>
          <ThemedText style={[styles.secondaryLabel, { color: colors.textSecondary }]}>
            Already subscribed? Sign in
          </ThemedText>
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
  error: { fontSize: 13, color: '#f87171', textAlign: 'center', marginBottom: 8 },
});
