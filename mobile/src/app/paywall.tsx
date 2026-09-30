import { getProPricing } from '@congtrade/shared/plans';
import { LinearGradient } from 'expo-linear-gradient';
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
import { brand, radius, useTheme } from '@/theme';
import { Button } from '@/ui/button';
import { Icon, type IconName } from '@/ui/icon';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

const BENEFITS: { icon: IconName; title: string; body: string }[] = [
  { icon: 'flash', title: 'Every trade, the day it is filed', body: 'Both chambers, every member who files.' },
  { icon: 'star', title: 'Follow members and stocks', body: 'Your Portfolio and Alerts fill up by themselves.' },
  { icon: 'mail-unread', title: 'Email alerts on your terms', body: 'By member, ticker, size or chamber.' },
  { icon: 'document-text', title: 'Straight from the filings', body: 'Every trade links to the original disclosure.' },
];

const PERIOD_WORD: Record<BillingPeriod, string> = { weekly: 'week', monthly: 'month', annual: 'year' };

/**
 * The paywall.
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

  const plans: { key: BillingPeriod; title: string; price: string; note: string; badge?: string }[] = [
    {
      key: 'weekly',
      title: 'Weekly',
      price: storePrice('weekly') ?? `${pricing.currencySymbol}${pricing.weekly}`,
      note: 'Most flexible',
    },
    {
      key: 'monthly',
      title: 'Monthly',
      price: storePrice('monthly') ?? `${pricing.currencySymbol}${pricing.monthly}`,
      note: 'Billed monthly',
      badge: pricing.monthlySavingVsWeeklyPercent ? `Save ${pricing.monthlySavingVsWeeklyPercent}%` : undefined,
    },
    {
      key: 'annual',
      title: 'Yearly',
      price: storePrice('annual') ?? `${pricing.currencySymbol}${pricing.annualTotal}`,
      note: 'Best value',
      badge: pricing.annualSavingPercent ? `Save ${pricing.annualSavingPercent}%` : undefined,
    },
  ];
  const chosen = plans.find((p) => p.key === period)!;

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={[...brand.hero]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + 22 }]}>
          <View style={styles.proBadge}>
            <Icon name="sparkles" size={14} color="#FFFFFF" />
            <Text variant="label" color="#FFFFFF">
              CONGTRADE PRO
            </Text>
          </View>
          <Animated.View entering={FadeInDown.duration(420)}>
            <Text variant="display" color="#FFFFFF" style={styles.heroTitle}>
              Know what Congress trades, first.
            </Text>
          </Animated.View>
          <View style={styles.benefits}>
            {BENEFITS.map((b, i) => (
              <Animated.View
                key={b.title}
                entering={FadeInDown.duration(400).delay(90 + i * 70)}
                style={styles.benefit}>
                <View style={styles.benefitIcon}>
                  <Icon name={b.icon} size={18} color="#FFFFFF" />
                </View>
                <View style={styles.flex}>
                  <Text variant="bodyStrong" color="#FFFFFF">
                    {b.title}
                  </Text>
                  <Text variant="caption" color="rgba(255,255,255,0.72)">
                    {b.body}
                  </Text>
                </View>
              </Animated.View>
            ))}
          </View>
        </LinearGradient>

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
                <View style={styles.flex}>
                  <View style={styles.planHead}>
                    <Text variant="subhead">{p.title}</Text>
                    {p.badge ? (
                      <View style={[styles.badge, { backgroundColor: c.accent }]}>
                        <Text variant="footnote" color="#FFFFFF" style={styles.bold}>
                          {p.badge}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text variant="caption" tone="muted">
                    {p.note}
                  </Text>
                </View>
                <View style={styles.price}>
                  <Text variant="subhead">{p.price}</Text>
                  <Text variant="footnote" tone="muted">
                    per {PERIOD_WORD[p.key]}
                  </Text>
                </View>
              </Tap>
            );
          })}
        </View>

        <Text variant="footnote" tone="muted" style={styles.legal}>
          {chosen.price} per {PERIOD_WORD[chosen.key]}, renewing automatically until you cancel. Cancel any time in your
          App Store or Google Play settings, at least 24 hours before the period ends. By subscribing you agree to the
          Terms of Service and the Privacy Policy.
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
          label={purchases.available ? `Continue with ${chosen.title}` : 'Not available on the web preview'}
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
  content: { paddingBottom: 24 },
  flex: { flex: 1, gap: 2 },
  bold: { fontWeight: '700' },
  center: { textAlign: 'center' },
  hero: { paddingHorizontal: 24, paddingBottom: 28, gap: 18, borderBottomLeftRadius: 32, borderBottomRightRadius: 32 },
  proBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  heroTitle: { maxWidth: 340 },
  benefits: { gap: 14 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  benefitIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  plans: { paddingHorizontal: 16, paddingTop: 22, gap: 10 },
  plan: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: radius.xl },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  price: { alignItems: 'flex-end' },
  legal: { paddingHorizontal: 22, paddingTop: 16, textAlign: 'center' },
  links: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8, paddingTop: 10 },
  link: { fontWeight: '700', textDecorationLine: 'underline' },
  footer: { paddingHorizontal: 20, paddingTop: 12, gap: 6, borderTopWidth: StyleSheet.hairlineWidth },
  secondary: { alignItems: 'center', paddingVertical: 8 },
});
