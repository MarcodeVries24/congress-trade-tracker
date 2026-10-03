import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccess } from '@/lib/access';
import { shortDate } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useOnboarding } from '@/lib/onboarding';
import { radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/avatar';
import { Button } from '@/ui/button';
import { CongBadge } from '@/ui/cong-mascot';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';
import { TickerLogo } from '@/ui/ticker-logo';

// Room the text, the examples and the buttons below Cong need, so he can
// take the rest.
const BELOW = 470;

/**
 * Three real trades from the filings, chosen by hand because they are the
 * ones people have heard of: what this app shows, before anyone has signed
 * up. Fixed rather than fetched so the first screen is the same strong
 * example every time and costs no request; each is verbatim from its
 * Periodic Transaction Report (member, asset, bracket, trade date).
 */
const EXAMPLES = [
  {
    name: 'Nancy Pelosi',
    party: 'Democrat',
    photo: 'https://bioguide.congress.gov/bioguide/photo/P/P000197.jpg',
    ticker: 'NVDA',
    company: 'NVIDIA',
    amount: '$1M – $5M',
    traded: '2024-07-26',
  },
  {
    name: 'Tommy Tuberville',
    party: 'Republican',
    photo: 'https://bioguide.congress.gov/bioguide/photo/T/T000278.jpg',
    ticker: 'INTC',
    company: 'Intel',
    amount: '$100K – $250K',
    traded: '2024-05-08',
  },
  {
    name: 'Marjorie Taylor Greene',
    party: 'Republican',
    photo: 'https://bioguide.congress.gov/bioguide/photo/G/G000596.jpg',
    ticker: 'UNH',
    company: 'UnitedHealth',
    amount: '$15K – $50K',
    traded: '2025-05-14',
  },
];

/**
 * The first screen anyone sees: Cong, the mascot, waving hello, one line of
 * promise, three real trades as the example, and the way in. Everything fits
 * on one screen with no scrolling; Cong grows or shrinks to the space the
 * phone leaves him, and from here he asks the setup questions himself.
 */
export default function WelcomeScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const router = useRouter();
  const { status } = useAccess();
  const { finish } = useOnboarding();

  // Someone who signs in here with an account that already has Pro (from the
  // website, or a store reviewer) has nothing to set up or buy: straight in.
  useFocusEffect(
    useCallback(() => {
      if (status !== 'pro') return;
      void finish().then(() => router.replace('/'));
    }, [status, finish, router])
  );

  // The disc is 1.55 times Cong's width; keep it inside what is left.
  const stage = height - insets.top - insets.bottom - BELOW;
  const mascot = Math.max(96, Math.min(200, (stage - 24) / 1.55));

  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: c.background, paddingTop: insets.top, paddingBottom: insets.bottom + 14 },
      ]}>
      <View style={styles.stage}>
        <Animated.View entering={ZoomIn.duration(500)}>
          <CongBadge width={mascot} wave halo={c.accentSoft} />
        </Animated.View>
      </View>

      <Animated.View entering={FadeInDown.duration(450).delay(150)} style={styles.copy}>
        <Text variant="title">Every trade Congress makes, in one place.</Text>
        <Text variant="body" tone="muted">
          Follow the stock trades of House and Senate members as they&apos;re filed.
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(450).delay(300)} style={styles.examples}>
        <Text variant="label" tone="faint">
          STRAIGHT FROM THE FILINGS
        </Text>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          {EXAMPLES.map((e, i) => (
            <View
              key={e.ticker}
              style={[
                styles.row,
                i < EXAMPLES.length - 1 && { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth },
              ]}>
              <Avatar uri={e.photo} name={e.name} party={e.party} size={36} />
              <View style={styles.flex}>
                <Text variant="callout" style={styles.bold} numberOfLines={1}>
                  {e.name}
                </Text>
                <View style={styles.asset}>
                  <TickerLogo ticker={e.ticker} size={18} />
                  <Text variant="footnote" tone="muted" numberOfLines={1} style={styles.flex}>
                    Bought {e.company} ({e.ticker})
                  </Text>
                </View>
              </View>
              <View style={styles.right}>
                <Text variant="footnote" style={styles.bold}>
                  {e.amount}
                </Text>
                <Text variant="footnote" tone="faint">
                  {shortDate(e.traded)}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </Animated.View>

      <View style={styles.footer}>
        <Button
          label="Get started"
          kind="accent"
          onPress={() => {
            haptic.tap();
            router.push('/onboarding/goal');
          }}
        />
        <Tap onPress={() => router.push('/sign-in')} hitSlop={8} style={styles.signIn}>
          <Text variant="callout" tone="muted">
            Already have an account?{' '}
            <Text variant="callout" style={styles.bold}>
              Sign in
            </Text>
          </Text>
        </Tap>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  copy: { paddingHorizontal: 16, gap: 8 },
  examples: { paddingHorizontal: 16, paddingTop: 20, gap: 8 },
  card: { borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  flex: { flex: 1, gap: 1 },
  right: { alignItems: 'flex-end', gap: 2 },
  asset: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  footer: { paddingHorizontal: 16, paddingTop: 20, gap: 12 },
  signIn: { alignItems: 'center', paddingVertical: 4 },
  bold: { fontWeight: '700' },
});
