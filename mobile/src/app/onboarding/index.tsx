import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccess } from '@/lib/access';
import { fetchTrades, type Trade } from '@/lib/api';
import { amountLabel, assetLabel, compactUSD, memberName, shortDate } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useOnboarding } from '@/lib/onboarding';
import { radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/avatar';
import { Button } from '@/ui/button';
import { CongBadge } from '@/ui/cong-mascot';
import { Skeleton } from '@/ui/skeleton';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';
import { TickerLogo } from '@/ui/ticker-logo';

// Room the text, the examples and the buttons below Cong need, so he can
// take the rest.
const BELOW = 470;

type Example = {
  key: string;
  name: string;
  party: string | null;
  photo: string | null;
  ticker: string;
  company: string;
  verb: string;
  amount: string;
  traded: string | null;
};

// How many of the latest filings to look through for the biggest: the 200
// newest stock trades are about the last couple of weeks of disclosures.
const RECENT = 200;
// Purchases and sales made this recently; exchanges are left out, as share
// swaps say little on their own.
const TRADED_WITHIN_DAYS = 90;

/**
 * The biggest recent stock trades, one per member, from the newest filings:
 * the largest disclosed brackets first, among purchases and sales made in the
 * last 90 days that have a ticker and a photo of who made them. Worked out here from the free feed, since sorting
 * by size within a date window is a Pro filter on the API.
 */
function biggestRecent(trades: Trade[]): Example[] {
  const seen = new Set<string>();
  // Traded in the last 90 days, not only filed in them: a late filing of a
  // year-old trade is not "recent" to anyone reading it.
  const since = new Date(Date.now() - TRADED_WITHIN_DAYS * 86_400_000).toISOString().slice(0, 10);
  return trades
    .filter((t) => t.ticker && t.photo_url && t.amount_low)
    .filter((t) => /^[PS]/i.test(t.transaction_type) && (t.transaction_date ?? '') >= since)
    .sort(
      (a, b) => (b.amount_low ?? 0) - (a.amount_low ?? 0) || (b.filing_date ?? '').localeCompare(a.filing_date ?? '')
    )
    .filter((t) => {
      const who = t.member_slug ?? t.member_name;
      if (seen.has(who)) return false;
      seen.add(who);
      return true;
    })
    .slice(0, 3)
    .map((t) => ({
      key: String(t.id),
      name: memberName(t),
      party: t.party,
      photo: t.photo_url,
      ticker: t.ticker!,
      company: assetLabel(t),
      // "Sold part of" costs the company name its room in this short row.
      verb: /^P/i.test(t.transaction_type) ? 'Bought' : 'Sold',
      amount:
        t.amount_low && t.amount_high
          ? `${compactUSD(t.amount_low)} – ${compactUSD(t.amount_high)}`
          : amountLabel(t.amount_range),
      traded: t.transaction_date,
    }));
}

/**
 * Three well-known real trades, as filed, for when the recent ones cannot be
 * loaded (offline on first launch): the screen should never show an empty
 * card.
 */
const FALLBACK: Example[] = [
  {
    key: 'pelosi-nvda',
    name: 'Nancy Pelosi',
    party: 'Democrat',
    photo: 'https://bioguide.congress.gov/bioguide/photo/P/P000197.jpg',
    ticker: 'NVDA',
    company: 'NVIDIA',
    verb: 'Bought',
    amount: '$1M – $5M',
    traded: '2024-07-26',
  },
  {
    key: 'tuberville-intc',
    name: 'Tommy Tuberville',
    party: 'Republican',
    photo: 'https://bioguide.congress.gov/bioguide/photo/T/T000278.jpg',
    ticker: 'INTC',
    company: 'Intel',
    verb: 'Bought',
    amount: '$100K – $250K',
    traded: '2024-05-08',
  },
  {
    key: 'greene-unh',
    name: 'Marjorie Taylor Greene',
    party: 'Republican',
    photo: 'https://bioguide.congress.gov/bioguide/photo/G/G000596.jpg',
    ticker: 'UNH',
    company: 'UnitedHealth',
    verb: 'Bought',
    amount: '$15K – $50K',
    traded: '2025-05-14',
  },
];

/**
 * The first screen anyone sees: Cong, the mascot, waving hello, one line of
 * promise, the three biggest recent stock trades as the example, and the way
 * in. Everything fits
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
  const [examples, setExamples] = useState<{
    rows: Example[];
    recent: boolean;
  } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchTrades({ limit: RECENT, assetTypes: ['ST'] }, { signal: controller.signal })
      .then((res) => {
        const rows = biggestRecent(res.data);
        setExamples(rows.length === 3 ? { rows, recent: true } : { rows: FALLBACK, recent: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) setExamples({ rows: FALLBACK, recent: false });
      });
    return () => controller.abort();
  }, []);

  // Someone who signs in here with an account that already has Pro (from the
  // website, or a store reviewer) has nothing to set up or buy: straight in.
  // An account without Pro (made on the website, say) has already met the
  // app, so it skips this screen and goes on to the questions, then the
  // plans. Only right after a sign-in started here: someone signed in who
  // goes back from the first question to this screen stays on it.
  const signingIn = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (status === 'pro') {
        signingIn.current = false;
        void finish().then(() => router.replace('/'));
      } else if (signingIn.current && status !== 'loading') {
        signingIn.current = false;
        if (status === 'free') router.push('/onboarding/goal');
      }
    }, [status, finish, router])
  );

  // The disc is 1.55 times Cong's width; keep it inside what is left.
  const stage = height - insets.top - insets.bottom - BELOW;
  const mascot = Math.max(96, Math.min(200, (stage - 24) / 1.55));

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: c.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom + 14,
        },
      ]}>
      <View style={styles.stage}>
        <Animated.View entering={ZoomIn.duration(500)}>
          <CongBadge width={mascot} wave halo={c.accentSoft} />
        </Animated.View>
      </View>

      <Animated.View entering={FadeInDown.duration(450).delay(150)} style={styles.copy}>
        <Text variant="title">Every trade Congress makes, in one place.</Text>
        <Text variant="body" tone="muted">
          Follow the stock trades of House and Senate members, updated daily.
        </Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.duration(450).delay(300)} style={styles.examples}>
        <Text variant="label" tone="faint">
          {examples && !examples.recent ? 'STRAIGHT FROM THE FILINGS' : 'BIGGEST RECENT TRADES'}
        </Text>
        <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
          {!examples
            ? [0, 1, 2].map((i) => (
                <View
                  key={i}
                  style={[
                    styles.row,
                    i < 2 && {
                      borderBottomColor: c.border,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                    },
                  ]}>
                  <Skeleton width={36} height={36} round={18} />
                  <View style={[styles.flex, styles.skeletonText]}>
                    <Skeleton width="55%" height={12} />
                    <Skeleton width="75%" height={10} />
                  </View>
                </View>
              ))
            : examples.rows.map((e, i) => (
                <View
                  key={e.key}
                  style={[
                    styles.row,
                    i < examples.rows.length - 1 && {
                      borderBottomColor: c.border,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                    },
                  ]}>
                  <Avatar uri={e.photo} name={e.name} party={e.party} size={36} />
                  <View style={styles.flex}>
                    <Text variant="callout" style={styles.bold} numberOfLines={1}>
                      {e.name}
                    </Text>
                    <View style={styles.asset}>
                      <TickerLogo ticker={e.ticker} size={18} />
                      <Text variant="footnote" tone="muted" numberOfLines={1} style={styles.flex}>
                        {e.verb} {e.company} ({e.ticker})
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
        <Tap
          onPress={() => {
            signingIn.current = true;
            router.push('/sign-in');
          }}
          hitSlop={8}
          style={styles.signIn}>
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
  card: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  flex: { flex: 1, gap: 1 },
  right: { alignItems: 'flex-end', gap: 2 },
  asset: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  skeletonText: { gap: 6 },
  footer: { paddingHorizontal: 16, paddingTop: 20, gap: 12 },
  signIn: { alignItems: 'center', paddingVertical: 4 },
  bold: { fontWeight: '700' },
});
