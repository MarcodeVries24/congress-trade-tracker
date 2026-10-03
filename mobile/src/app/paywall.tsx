import { memberDisplayNameFromFiledName } from '@congtrade/shared/memberDisplay';
import { getProPricing } from '@congtrade/shared/plans';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccess } from '@/lib/access';
import { fetchPolitician, fetchTrades, type Trade } from '@/lib/api';
import { assetLabel, compactAmount, memberName, tradeVerb } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { LINKS, openPage } from '@/lib/links';
import type { BillingPeriod } from '@/lib/products';
import { useOnboarding } from '@/lib/onboarding';
import { usePurchases } from '@/lib/use-purchases';
import { CongSays, ONBOARDING_STEPS, STEP_TOP_BAR, useStepBack } from '@/components/onboarding-step';
import { radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/avatar';
import { Button, IconButton } from '@/ui/button';
import { Icon } from '@/ui/icon';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';
import { TickerLogo } from '@/ui/ticker-logo';

// Weeks in each billing period, for the per-week figure under the longer
// plans; the same 52 / 12 the shared pricing uses for its savings.
const WEEKS: Record<BillingPeriod, number> = { weekly: 1, monthly: 52 / 12, annual: 52 };

// Where the subscription is managed: only the store this phone buys from.
const STORE = Platform.select({ ios: 'App Store', android: 'Google Play', default: 'app store' });

const PERIOD_WORD: Record<BillingPeriod, string> = { weekly: 'week', monthly: 'month', annual: 'year' };

/**
 * The paywall.
 *
 * Cong asks from the same place as on the setup steps before it, by name for
 * whoever was picked there, so the setup reads as something Pro switches on
 * rather than answers thrown away. Then the most recent real filing, theirs
 * when there is one, as proof the feed is live; three one-line reasons; and the plans, with the longer
 * ones priced per week so the saving is plain. Nothing here is invented: no
 * reviews, no counts of other subscribers.
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
  const goBack = useStepBack(ONBOARDING_STEPS + 1);
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

  // The longer plans' price per week: in the store's currency when it gives a
  // number, from the shared euro pricing in the preview with no store.
  const perWeek = (p: BillingPeriod): string | null => {
    if (p === 'weekly') return null;
    const product = purchases.products.find((x) => x.period === p);
    if (product) {
      if (!product.price || !product.currency) return null;
      try {
        return new Intl.NumberFormat(undefined, { style: 'currency', currency: product.currency }).format(
          product.price / WEEKS[p]
        );
      } catch {
        return null;
      }
    }
    const total = Number(p === 'monthly' ? pricing.monthly : pricing.annualTotal);
    return `${pricing.currencySymbol}${(total / WEEKS[p]).toFixed(2)}`;
  };

  // Whoever was picked during setup, once each: a member can be filed under
  // several spellings and the answers keep all of them.
  const { answers } = useOnboarding();
  const followed = [...new Set(answers.members.map(memberDisplayNameFromFiledName))];
  const who = followed.length === 1 ? followed[0] : `${followed[0]} and ${followed.length - 1} more`;

  // Naming who was picked, without suggesting Pro is limited to them: it
  // covers every member, and anyone can be followed later.
  const benefits = [
    "Every member's trades, the day they're filed",
    followed.length === 1
      ? `Alerts for ${followed[0]} and all of Congress`
      : followed.length > 1
        ? 'Alerts for them and all of Congress'
        : 'Alerts for anyone in Congress, by push or email',
    'The best-timed trades, and how they did since',
  ];

  const latest = useLatestFiling(answers.members);

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
          where it was. Back always leads to the last step, also when this was
          opened at launch for an account without Pro. Sign in takes the place
          Skip has on the steps: the way in for anyone who already pays on the
          website, and for a store reviewer holding a test login. */}
      <View style={[styles.top, { paddingTop: insets.top + STEP_TOP_BAR.paddingTop }]}>
        <IconButton name="chevron-back" label="Back" onPress={goBack} size={STEP_TOP_BAR.row} />
        <Tap onPress={() => router.push('/sign-in')} hitSlop={10}>
          <Text variant="callout" tone="muted" style={styles.semibold}>
            Sign in
          </Text>
        </Tap>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {followed.length ? (
          <CongSays
            pose="pro"
            title={`Ready to watch ${who} for you.`}
            subtitle="And anyone else in Congress, the day they trade."
          />
        ) : (
          <CongSays pose="pro" title="Every trade Congress makes, the day it's filed." subtitle="Cancel anytime." />
        )}

        {latest ? (
          <Animated.View
            entering={FadeInDown.duration(380).delay(60)}
            style={[styles.latest, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={styles.latestHead}>
              <View style={[styles.liveDot, { backgroundColor: c.gain }]} />
              <Text variant="caption" tone="muted" style={styles.semibold}>
                Latest filing
              </Text>
            </View>
            <View style={styles.latestRow}>
              <Avatar uri={latest.photo} name={latest.name} party={latest.party} size={36} />
              <View style={styles.flex}>
                <Text variant="callout" style={styles.bold} numberOfLines={1}>
                  {latest.name}
                </Text>
                <View style={styles.asset}>
                  <TickerLogo ticker={latest.ticker} size={16} />
                  <Text variant="footnote" tone="muted" numberOfLines={1} style={styles.flex}>
                    {latest.what}
                  </Text>
                </View>
              </View>
              <Text variant="footnote" style={styles.bold}>
                {latest.amount}
              </Text>
            </View>
          </Animated.View>
        ) : null}

        <View style={styles.benefits}>
          {benefits.map((b, i) => (
            <Animated.View key={i} entering={FadeInDown.duration(380).delay(80 + i * 60)} style={styles.benefit}>
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
                accessibilityState={{ selected }}
                style={[
                  styles.plan,
                  {
                    backgroundColor: selected ? c.accentSoft : c.surface,
                    borderColor: selected ? c.accent : c.border,
                    borderWidth: selected ? 2 : StyleSheet.hairlineWidth,
                  },
                ]}>
                <View
                  style={[
                    styles.radio,
                    selected ? { borderColor: c.accent, backgroundColor: c.accent } : { borderColor: c.borderStrong },
                  ]}>
                  {selected ? <Icon name="checkmark" size={14} color="#FFFFFF" /> : null}
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
                <View style={styles.price}>
                  <Text variant="subhead">
                    {p.price}
                    <Text variant="footnote" tone="muted">
                      {' '}
                      / {PERIOD_WORD[p.key]}
                    </Text>
                  </Text>
                  {perWeek(p.key) ? (
                    <Text variant="caption" tone={selected ? 'accent' : 'muted'} style={styles.semibold}>
                      {perWeek(p.key)} / week
                    </Text>
                  ) : null}
                </View>
              </Tap>
            );
          })}
        </View>
      </ScrollView>

      {/* The button and everything Apple's guideline 3.1.2 asks to sit with it:
          the price per period, that it renews and how to stop it, the terms,
          the privacy policy, and a way to restore a purchase. */}
      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + 10, borderTopColor: c.border, backgroundColor: c.background },
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
              ? `Start Pro for ${chosen.price} a ${PERIOD_WORD[chosen.key]}`
              : (purchases.unavailableReason ?? 'Not available here')
          }
          loading={purchases.busy !== null}
          disabled={!purchases.available}
          onPress={() => {
            haptic.commit();
            void purchases.buy(period);
          }}
        />
        <Text variant="caption" tone="faint" style={styles.legal}>
          {chosen.price} a {PERIOD_WORD[chosen.key]}, renews automatically. Cancel in your {STORE} settings at least 24
          hours before it renews.
        </Text>
        <View style={styles.links}>
          {/* Apple requires a visible way to restore a purchase: someone who
              paid and reinstalled has no other route back in. */}
          {purchases.available ? (
            <FinePrintLink
              label="Restore purchases"
              onPress={async () => {
                await purchases.restore();
                await refresh();
              }}
            />
          ) : null}
          <FinePrintLink label="Terms" onPress={() => openPage(LINKS.terms)} />
          <FinePrintLink label="Privacy" onPress={() => openPage(LINKS.privacy)} />
          {access.skipForDevelopment ? (
            <FinePrintLink
              label="Skip (dev)"
              onPress={() => {
                access.skipForDevelopment?.();
                router.replace('/');
              }}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** A filed trade as the card shows it, from either source below. */
type Filing = {
  name: string;
  photo: string | null;
  party: string | null;
  ticker: string;
  what: string;
  amount: string;
};

// Picked members whose recent trades are looked through, at most: one request
// each, and the card shows only one trade.
const MEMBERS_ASKED = 5;

// A stock bought or sold: options (OP) carry the underlying's ticker too, but
// read as "Sold PUT/XSP @ 730 EXP 11/20/2026".
const isStockBuyOrSale = (t: { ticker: string | null; transaction_type: string; asset_type_code?: string | null }) =>
  !!t.ticker && /^[PS]/i.test(t.transaction_type) && (t.asset_type_code ?? 'ST') === 'ST';

/**
 * The most recent stock purchase or sale filed by the members picked during
 * setup, or by anyone when nobody was picked or none of them has one; null
 * until it loads (and if it cannot), as the screen is complete without it.
 *
 * Each member comes from their page's free endpoint rather than a member
 * filter on /api/trades, which is a Pro filter the API drops for everyone
 * else, and everyone on this screen is someone else.
 */
function useLatestFiling(filedNames: string[]): Filing | null {
  const [latest, setLatest] = useState<Filing | null>(null);
  // Spellings of one person can differ; their slugs mostly do not.
  const slugs = [...new Set(filedNames.map(memberSlug))].slice(0, MEMBERS_ASKED);
  const key = slugs.join(',');

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const anyone = () =>
      fetchTrades({ limit: 20, assetTypes: ['ST'] }, { signal }).then((res) => {
        const t = res.data.find(isStockBuyOrSale);
        return t ? asFiling(memberName(t), t.photo_url, t.party, t) : null;
      });
    const theirs = async () => {
      const pages = await Promise.all(
        key.split(',').map((slug) => fetchPolitician(slug, { signal }).catch(() => null))
      );
      let best: { filing: Filing; filed: string } | null = null;
      for (const page of pages) {
        const t = page?.trades.find(isStockBuyOrSale);
        if (!page || !t) continue;
        const filed = t.filing_date ?? '';
        if (!best || filed > best.filed) {
          best = { filing: asFiling(page.profile.display, page.profile.photo_url, page.profile.party, t), filed };
        }
      }
      return best?.filing ?? null;
    };
    (key ? theirs() : Promise.resolve(null))
      .then((filing) => filing ?? anyone())
      .then(setLatest)
      .catch(() => {});
    return () => controller.abort();
  }, [key]);
  return latest;
}

function asFiling(
  name: string,
  photo: string | null,
  party: string | null,
  t: Pick<Trade, 'asset_name' | 'ticker' | 'company_name' | 'transaction_type' | 'amount_range'>
): Filing {
  return {
    name,
    photo,
    party,
    ticker: t.ticker!,
    what: `${tradeVerb(t.transaction_type)} ${assetLabel(t)} (${t.ticker})`,
    amount: compactAmount(t.amount_range),
  };
}

/** A member's page slug from a filed spelling: web/lib/memberSlug.ts, which the API resolves. */
function memberSlug(name: string): string {
  return name
    .replace(/^Hon\.\s+/i, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function FinePrintLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Tap onPress={onPress} hitSlop={8}>
      <Text variant="caption" tone="muted" style={styles.semibold}>
        {label}
      </Text>
    </Tap>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: STEP_TOP_BAR.paddingBottom,
  },
  content: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 20 },
  flex: { flex: 1 },
  bold: { fontWeight: '700' },
  semibold: { fontWeight: '600' },
  center: { textAlign: 'center' },
  benefits: { gap: 8, paddingTop: 14, paddingHorizontal: 4 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  check: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  plans: { paddingTop: 16, gap: 8 },
  price: { alignItems: 'flex-end', gap: 1 },
  latest: { marginTop: 14, padding: 12, gap: 8, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth },
  latestHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  latestRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  asset: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: radius.xl,
  },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  footer: { paddingHorizontal: 16, paddingTop: 12, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  legal: { textAlign: 'center', paddingHorizontal: 8 },
  links: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', columnGap: 20, rowGap: 6 },
});
