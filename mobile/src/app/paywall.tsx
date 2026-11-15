import { memberDisplayNameFromFiledName } from '@congtrade/shared/memberDisplay';
import { getProPricing } from '@congtrade/shared/plans';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useFocusEffect, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccess } from '@/lib/access';
import { confirmSignOut } from '@/lib/confirm-sign-out';
import { fetchAlertExample, type AlertExample } from '@/lib/example-trades';
import { haptic } from '@/lib/haptics';
import { LINKS, openPage } from '@/lib/links';
import type { BillingPeriod, Trial } from '@/lib/products';
import { useOnboarding } from '@/lib/onboarding';
import { usePush } from '@/lib/push';
import { usePurchases } from '@/lib/use-purchases';
import { CongSays, ONBOARDING_STEPS, STEP_TOP_BAR, useStepBack } from '@/components/onboarding-step';
import { radius, useTheme } from '@/theme';
import { Button, IconButton } from '@/ui/button';
import { Icon } from '@/ui/icon';
import { Skeleton } from '@/ui/skeleton';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

// Where the subscription is managed: only the store this phone buys from.
const STORE = Platform.select({ ios: 'App Store', android: 'Google Play', default: 'app store' });

const PERIOD_WORD: Record<BillingPeriod, string> = { weekly: 'week', monthly: 'month', annual: 'year' };

// What the web preview and Expo Go show for the yearly plan, which have no
// store to ask. In the apps the trial is whatever the store says this person
// gets, and none at all when they have had one before.
const PREVIEW_TRIAL: Trial = { length: '14 days', offerToken: null };

// Inside a plan card, border included, so a picked card's content sits where
// an unpicked one's does.
const PLAN_PADDING = 14;

// The app's own icon, at the corner of the example alert, as a notification shows it.
const APP_ICON = require('../../assets/images/icon.png');

/**
 * The paywall.
 *
 * Cong asks from the same place as on the setup steps before it, by name for
 * whoever was picked there, so the setup reads as something Pro switches on
 * rather than answers thrown away. It reads top to bottom: an alert as it
 * would arrive, made from a real recent filing (theirs when there is one);
 * then "Choose your plan", Yearly first, the picked plan opening to show
 * what Pro includes (the same on every plan); then the button. Each thing
 * is said once. Nothing here is invented: no reviews, no counts of other
 * subscribers, no made-up trades.
 *
 * Yearly is preselected, with its free trial: the trial removes the risk of
 * the larger commitment, and the weekly and monthly plans are cheap enough to
 * start on without one, so they have none.
 *
 * Prices come from the store, not from us: the store's figure is what will be
 * charged, in the person's own currency. @congtrade/shared is the fallback for
 * the web preview, which has no store to ask.
 *
 * Apple's guideline 3.1.2 wants the length, the price per period, working
 * links to the terms and the privacy policy, and a restore control on this
 * screen itself. All four are here, and none is hidden behind a tap. With a
 * trial, the price stays the biggest figure on the plan and the fine print
 * says what is charged when the trial ends.
 *
 * Someone signed out who taps the button is sent to sign in, and the purchase
 * carries on by itself once they are back, so it is credited to their account.
 *
 * Nothing on this screen decides whether anyone is entitled to anything: a
 * purchase is reported to the server, which asks the store.
 */
export default function PaywallScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const pricing = getProPricing('eur');
  const [period, setPeriod] = useState<BillingPeriod>('annual');
  const goBack = useStepBack(ONBOARDING_STEPS + 1);
  const access = useAccess();
  const { refresh } = access;
  const { isSignedIn } = useAuth();
  const email = useUser().user?.primaryEmailAddress?.emailAddress;
  // Through push, so this phone's push token is unregistered with the account it belonged to.
  const { signOut } = usePush();
  const purchases = usePurchases(useCallback(() => void refresh(), [refresh]));

  // Also how signing in gets someone past this screen: an account that already
  // has Pro flips this on its own. Only while on top, so it waits for the
  // sign-in sheet to close rather than navigating out from underneath it.
  useFocusEffect(
    useCallback(() => {
      if (access.status === 'pro') router.replace('/');
    }, [access.status, router])
  );

  // The plan picked before being sent to sign in, bought once they are back
  // signed in. Never for an account that turns out to have Pro already (the
  // effect above takes it away instead), and dropped if they come back
  // without signing in.
  const [pending, setPending] = useState<BillingPeriod | null>(null);
  const { accountReady, buy } = purchases;
  useFocusEffect(
    useCallback(() => {
      if (!pending) return;
      if (access.status === 'signed-out' || access.status === 'unknown') setPending(null);
      else if (access.status === 'free' && accountReady) {
        setPending(null);
        void buy(pending);
      }
    }, [pending, access.status, accountReady, buy])
  );

  const subscribe = () => {
    haptic.commit();
    if (access.status === 'signed-out') {
      setPending(period);
      // Someone who passed the account step with "Not now": a new account,
      // most likely, so the screen says so rather than "Welcome back".
      router.push({ pathname: '/sign-in', params: { intent: 'create' } });
    } else void buy(period);
  };

  const storePrice = (p: BillingPeriod) => purchases.products.find((x) => x.period === p)?.displayPrice;
  const trialFor = (p: BillingPeriod): Trial | null =>
    purchases.available
      ? (purchases.products.find((x) => x.period === p)?.trial ?? null)
      : p === 'annual'
        ? PREVIEW_TRIAL
        : null;

  // Whoever was picked during setup, once each: a member can be filed under
  // several spellings and the answers keep all of them.
  const { answers } = useOnboarding();
  const followed = [...new Set(answers.members.map(memberDisplayNameFromFiledName))];
  const who = followed.length === 1 ? followed[0] : `${followed[0]} and ${followed.length - 1} more`;

  // A real trade, as an alert would announce it, from the latest filing:
  // theirs when someone was picked and has stock trades, else anyone's, else
  // a well-known filed one when the feed cannot be reached.
  const [shown, setShown] = useState<AlertExample | null>(null);
  const example = shown?.example;
  const filed = answers.members.join('|');
  useEffect(() => {
    const controller = new AbortController();
    fetchAlertExample(filed ? filed.split('|') : [], controller.signal)
      .then(setShown)
      .catch(() => {});
    return () => controller.abort();
  }, [filed]);

  // What Pro includes, shown inside the picked plan. Naming who was picked,
  // without suggesting Pro is limited to them: it covers every member, and
  // anyone can be followed later.
  const benefits = [
    followed.length === 1
      ? `Alerts for ${followed[0]} and all of Congress`
      : followed.length > 1
        ? 'Alerts for them and all of Congress'
        : 'Alerts for anyone in Congress, by push or email',
    'The best-timed trades, and how they did since',
  ];

  // Yearly first: it is the one preselected, with the trial, so the choice
  // reads from the recommended plan down.
  const plans: { key: BillingPeriod; title: string; price: string; badge?: string }[] = [
    {
      key: 'annual',
      title: 'Yearly',
      price: storePrice('annual') ?? `${pricing.currencySymbol}${pricing.annualTotal}`,
      badge: pricing.annualSavingPercent ? `Save ${pricing.annualSavingPercent}%` : undefined,
    },
    {
      key: 'monthly',
      title: 'Monthly',
      price: storePrice('monthly') ?? `${pricing.currencySymbol}${pricing.monthly}`,
      badge: pricing.monthlySavingVsWeeklyPercent ? `Save ${pricing.monthlySavingVsWeeklyPercent}%` : undefined,
    },
    { key: 'weekly', title: 'Weekly', price: storePrice('weekly') ?? `${pricing.currencySymbol}${pricing.weekly}` },
  ];
  const chosen = plans.find((p) => p.key === period)!;
  const chosenTrial = trialFor(chosen.key);

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      {/* A setup step's top bar, so Cong sits where he did and the way back is
          where it was. Back always leads to the last step, also when this was
          opened at launch for an account without Pro. Sign in takes the place
          Skip has on the steps: the way in for anyone who already pays on the
          website, and for a store reviewer holding a test login. */}
      <View style={[styles.top, { paddingTop: insets.top + STEP_TOP_BAR.paddingTop }]}>
        <IconButton name="chevron-back" label="Back" onPress={goBack} size={STEP_TOP_BAR.row} />
        {/* Signed in already (on the account step, say), the way to another
            account is to leave this one first: asked, then signed out, then
            the sign-in screen, which closes itself once they are in. */}
        <Tap
          onPress={() =>
            isSignedIn
              ? confirmSignOut(signOut, {
                  wording: {
                    title: 'Use another account?',
                    message: email ? `You'll be signed out of ${email} first.` : "You'll be signed out first.",
                    confirm: 'Switch',
                  },
                  then: () => router.push('/sign-in'),
                })
              : router.push('/sign-in')
          }
          hitSlop={10}>
          <Text variant="callout" tone="muted" style={styles.semibold}>
            {isSignedIn ? 'Switch account' : 'Sign in'}
          </Text>
        </Tap>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Top to bottom: what Pro does (an alert, as it arrives), then the
            choice, with what is included inside it, and the button. */}
        <CongSays pose="pro" title={followed.length ? `Ready to watch ${who} for you.` : 'Your alerts are ready.'} />

        <Animated.View entering={FadeInDown.duration(420).delay(60)} style={styles.exampleWrap}>
          <View style={[styles.notification, { backgroundColor: c.surface, borderColor: c.border }]}>
            <Image source={APP_ICON} style={[styles.appIcon, { borderColor: c.border }]} />
            {example ? (
              <View style={styles.flex}>
                <View style={styles.notificationHead}>
                  <Text variant="caption" tone="muted" style={styles.semibold}>
                    CONGTRADE
                  </Text>
                  {/* What it is, so it is not taken for a notification of their own. */}
                  <Text variant="caption" tone="faint">
                    {shown?.label}
                  </Text>
                </View>
                <Text variant="callout" style={styles.bold} numberOfLines={1}>
                  {example.name} {example.verb.toLowerCase()} {example.ticker}
                </Text>
                <Text variant="footnote" tone="muted" numberOfLines={1}>
                  {example.amount} · {example.company}
                </Text>
              </View>
            ) : (
              <View style={[styles.flex, styles.skeletonText]}>
                <Skeleton width="30%" height={10} />
                <Skeleton width="70%" height={12} />
                <Skeleton width="50%" height={10} />
              </View>
            )}
          </View>
        </Animated.View>

        <View style={styles.plans}>
          <Text variant="label" tone="faint" style={styles.plansLabel}>
            CHOOSE YOUR PLAN
          </Text>
          {plans.map((p) => {
            const selected = period === p.key;
            return (
              // The card grows to show what Pro includes when it is picked,
              // and the ones below glide down to make room.
              <Animated.View key={p.key} layout={LinearTransition.duration(240)}>
                <Tap
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
                      // The thicker border of the picked card is taken off
                      // its padding, so nothing inside moves when it is picked.
                      padding: PLAN_PADDING - (selected ? 2 : StyleSheet.hairlineWidth),
                    },
                  ]}>
                  <View style={styles.planRow}>
                    <View
                      style={[
                        styles.radio,
                        selected
                          ? { borderColor: c.accent, backgroundColor: c.accent }
                          : { borderColor: c.borderStrong },
                      ]}>
                      {selected ? <Icon name="checkmark" size={14} color="#FFFFFF" /> : null}
                    </View>
                    <View style={[styles.flex, styles.planText]}>
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
                      {trialFor(p.key) ? (
                        <Text variant="caption" tone="accent" style={styles.semibold}>
                          {trialFor(p.key)!.length} free
                        </Text>
                      ) : null}
                    </View>
                    {/* One price per plan; the badge already says what the
                    longer ones save. */}
                    <Text variant="subhead">
                      {p.price}
                      <Text variant="footnote" tone="muted">
                        {' '}
                        / {PERIOD_WORD[p.key]}
                      </Text>
                    </Text>
                  </View>
                  {/* What Pro includes, the same on every plan: shown in the
                    picked one only, so the screen holds one list, not three. */}
                  {selected ? (
                    <Animated.View
                      entering={FadeIn.duration(220).delay(80)}
                      exiting={FadeOut.duration(120)}
                      style={styles.included}>
                      {benefits.map((b) => (
                        <View key={b} style={styles.benefit}>
                          <Icon name="checkmark" size={16} color={c.accent} />
                          <Text variant="footnote" style={styles.flex}>
                            {b}
                          </Text>
                        </View>
                      ))}
                    </Animated.View>
                  ) : null}
                </Tap>
              </Animated.View>
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
            !purchases.available
              ? (purchases.unavailableReason ?? 'Not available here')
              : chosenTrial
                ? `Try free for ${chosenTrial.length}`
                : `Start Pro for ${chosen.price} a ${PERIOD_WORD[chosen.key]}`
          }
          loading={purchases.busy !== null || pending !== null}
          disabled={!purchases.available}
          onPress={subscribe}
        />
        {/* What it costs after the trial, that it renews, and how to stop
            it, in one line under the button (with the store's own sheet,
            this is what guideline 3.1.2 asks for). The 24-hour rule is in
            the store descriptions and the terms. */}
        <Text variant="caption" tone="faint" style={styles.legal}>
          {chosenTrial ? `${chosenTrial.length} free, then ` : ''}
          {chosen.price} a {PERIOD_WORD[chosen.key]}. Renews automatically until you cancel in your {STORE} settings.
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
  exampleWrap: { paddingTop: 18 },
  notification: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  // The icon is white, so an edge keeps it from melting into the card.
  appIcon: { width: 38, height: 38, borderRadius: 9, borderWidth: StyleSheet.hairlineWidth },
  notificationHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  skeletonText: { gap: 6 },
  plansLabel: { paddingHorizontal: 4 },
  benefit: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  plans: { paddingTop: 22, gap: 10 },
  plan: { borderRadius: radius.xl },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // Under the plan's name, past the radio (24) and its gap (12).
  included: { gap: 6, marginTop: 10, marginLeft: 36 },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  planText: { gap: 2 },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  footer: { paddingHorizontal: 16, paddingTop: 12, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  legal: { textAlign: 'center', paddingHorizontal: 8 },
  links: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', columnGap: 20, rowGap: 6 },
});
