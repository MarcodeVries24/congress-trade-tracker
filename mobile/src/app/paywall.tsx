import { getProPricing } from '@congtrade/shared/plans';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccess } from '@/lib/access';
import { haptic } from '@/lib/haptics';
import { LINKS, openPage } from '@/lib/links';
import type { BillingPeriod } from '@/lib/products';
import { usePurchases } from '@/lib/use-purchases';
import { CongSays, STEP_TOP_BAR } from '@/components/onboarding-step';
import { radius, useTheme } from '@/theme';
import { Button, IconButton } from '@/ui/button';
import { Icon } from '@/ui/icon';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

const BENEFITS = [
  'Every trade, the day it is filed',
  'Alerts by push or email, on any filter',
  'Follow the politicians you choose',
];

const PERIOD_WORD: Record<BillingPeriod, string> = { weekly: 'week', monthly: 'month', annual: 'year' };

/**
 * The paywall.
 *
 * Cong asks from the same place as on the setup steps before it, then three
 * one-line reasons and the plans: the whole choice on one screen.
 *
 * Weekly is preselected because it is what someone who has just met the app
 * will commit to, and the longer plans carry the saving so they argue for
 * themselves.
 *
 * Prices come from the store, not from us: the store's figure is what will be
 * charged, in the person's own currency. @congtrade/shared is the fallback for
 * the web preview, which has no store to ask.
 *
 * Apple's guideline 3.1.2 wants the length, the price per period, working
 * links to the terms and the privacy policy, and a restore control on this
 * screen itself. All four are here, and none is hidden behind a tap.
 *
 * Nothing on this screen decides whether anyone is entitled to anything: a
 * purchase is reported to the server, which asks the store.
 */
export default function PaywallScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const pricing = getProPricing('eur');
  const [period, setPeriod] = useState<BillingPeriod>('weekly');
  const access = useAccess();
  const { refresh } = access;
  const purchases = usePurchases(useCallback(() => void refresh(), [refresh]));

  // Also how signing in gets someone past this screen: an account that already
  // has Pro flips this on its own. Only while on top, so it waits for the
  // sign-in sheet to close rather than navigating out from underneath it.
  useFocusEffect(
    useCallback(() => {
      if (access.status === 'pro') router.replace('/');
    }, [access.status, router])
  );

  const storePrice = (p: BillingPeriod) => purchases.products.find((x) => x.period === p)?.displayPrice;

  const plans: { key: BillingPeriod; title: string; price: string; badge?: string }[] = [
    {
      key: 'weekly',
      title: 'Weekly',
      price: storePrice('weekly') ?? `${pricing.currencySymbol}${pricing.weekly}`,
    },
    {
      key: 'monthly',
      title: 'Monthly',
      price: storePrice('monthly') ?? `${pricing.currencySymbol}${pricing.monthly}`,
      badge: pricing.monthlySavingVsWeeklyPercent ? `Save ${pricing.monthlySavingVsWeeklyPercent}%` : undefined,
    },
    {
      key: 'annual',
      title: 'Yearly',
      price: storePrice('annual') ?? `${pricing.currencySymbol}${pricing.annualTotal}`,
      badge: pricing.annualSavingPercent ? `Save ${pricing.annualSavingPercent}%` : undefined,
    },
  ];
  const chosen = plans.find((p) => p.key === period)!;

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      {/* A setup step's top bar, so Cong sits where he did and the way back is
          where it was. Only with somewhere to go back to: opened at launch for
          an account without Pro, this is the first screen. */}
      <View style={[styles.top, { paddingTop: insets.top + STEP_TOP_BAR.paddingTop }]}>
        <View style={styles.topRow}>
          {router.canGoBack() ? (
            <IconButton name="chevron-back" label="Back" onPress={() => router.back()} size={STEP_TOP_BAR.row} />
          ) : null}
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <CongSays title="Unlock everything with Pro." subtitle="Cancel anytime." />

        <View style={styles.benefits}>
          {BENEFITS.map((b, i) => (
            <Animated.View key={b} entering={FadeInDown.duration(380).delay(80 + i * 60)} style={styles.benefit}>
              <View style={[styles.check, { backgroundColor: c.accentSoft }]}>
                <Icon name="checkmark" size={14} color={c.accent} />
              </View>
              <Text variant="callout" style={styles.flex}>
                {b}
              </Text>
            </Animated.View>
          ))}
        </View>

        <View style={styles.plans}>
          {plans.map((p) => {
            const selected = period === p.key;
            return (
              <Tap
                key={p.key}
                scaleTo={0.98}
                onPress={() => {
                  haptic.select();
                  setPeriod(p.key);
                }}
                style={[
                  styles.plan,
                  {
                    backgroundColor: c.surface,
                    borderColor: selected ? c.primary : c.border,
                    borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
                  },
                ]}>
                <View
                  style={[
                    styles.radio,
                    selected ? { borderColor: c.primary, backgroundColor: c.primary } : { borderColor: c.borderStrong },
                  ]}>
                  {selected ? <Icon name="checkmark" size={14} color={c.primaryText} /> : null}
                </View>
                <View style={[styles.flex, styles.planHead]}>
                  <Text variant="subhead">{p.title}</Text>
                  {p.badge ? (
                    <View style={[styles.badge, { backgroundColor: c.accent }]}>
                      <Text variant="footnote" color="#FFFFFF" style={styles.bold}>
                        {p.badge}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text variant="subhead">
                  {p.price}
                  <Text variant="footnote" tone="muted">
                    {' '}
                    / {PERIOD_WORD[p.key]}
                  </Text>
                </Text>
              </Tap>
            );
          })}
        </View>

        {/* Apple 3.1.2: the price per period, that it renews, and how to stop it. */}
        <Text variant="footnote" tone="faint" style={styles.legal}>
          {chosen.price} per {PERIOD_WORD[chosen.key]}, renews automatically. Cancel anytime in your App Store or Google
          Play settings, at least 24 hours before it renews.
        </Text>
        <View style={styles.links}>
          <Tap onPress={() => openPage(LINKS.terms)} hitSlop={8}>
            <Text variant="footnote" style={styles.link}>
              Terms of Service
            </Text>
          </Tap>
          <Text variant="footnote" tone="faint">
            ·
          </Text>
          <Tap onPress={() => openPage(LINKS.privacy)} hitSlop={8}>
            <Text variant="footnote" style={styles.link}>
              Privacy Policy
            </Text>
          </Tap>
          {purchases.available ? (
            <>
              <Text variant="footnote" tone="faint">
                ·
              </Text>
              {/* Apple requires a visible way to restore a purchase: someone who
                  paid and reinstalled has no other route back in. */}
              <Tap
                onPress={async () => {
                  await purchases.restore();
                  await refresh();
                }}
                hitSlop={8}>
                <Text variant="footnote" style={styles.link}>
                  Restore purchases
                </Text>
              </Tap>
            </>
          ) : null}
        </View>
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + 12, borderTopColor: c.border, backgroundColor: c.background },
        ]}>
        {purchases.error ? (
          <Text variant="caption" tone="loss" style={styles.center}>
            {purchases.error}
          </Text>
        ) : null}
        <Button
          kind="accent"
          label={
            purchases.available
              ? `Continue with ${chosen.title}`
              : (purchases.unavailableReason ?? 'Not available here')
          }
          loading={purchases.busy !== null}
          disabled={!purchases.available}
          onPress={() => {
            haptic.commit();
            void purchases.buy(period);
          }}
        />
        {/* The way in for anyone who already pays on the website, and for a
            store reviewer holding a test login. */}
        <Tap onPress={() => router.push('/sign-in')} hitSlop={8} style={styles.secondary}>
          <Text variant="callout" tone="muted">
            Already subscribed?{' '}
            <Text variant="callout" style={styles.bold}>
              Sign in
            </Text>
          </Text>
        </Tap>
        {access.skipForDevelopment ? (
          <Tap
            onPress={() => {
              access.skipForDevelopment?.();
              router.replace('/');
            }}
            style={styles.secondary}>
            <Text variant="footnote" tone="faint">
              Skip (development builds only)
            </Text>
          </Tap>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: { paddingHorizontal: 16, paddingBottom: STEP_TOP_BAR.paddingBottom },
  topRow: { height: STEP_TOP_BAR.row, flexDirection: 'row', alignItems: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20 },
  flex: { flex: 1 },
  bold: { fontWeight: '700' },
  center: { textAlign: 'center' },
  benefits: { gap: 10, paddingTop: 22, paddingHorizontal: 4 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  check: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  plans: { paddingTop: 22, gap: 10 },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: radius.xl,
  },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  legal: { paddingTop: 14, textAlign: 'center' },
  links: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8, paddingTop: 8 },
  link: { fontWeight: '700', textDecorationLine: 'underline' },
  footer: { paddingHorizontal: 16, paddingTop: 12, gap: 4, borderTopWidth: StyleSheet.hairlineWidth },
  secondary: { alignItems: 'center', paddingVertical: 8 },
});
