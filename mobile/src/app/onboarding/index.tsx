import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccess } from '@/lib/access';
import { fetchTrades } from '@/lib/api';
import { biggestRecent, FALLBACK, RECENT, type Example } from '@/lib/example-trades';
import { shortDate } from '@/lib/format';
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
const BELOW = 494;


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
  const { status, endedAt } = useAccess();
  // Back here because their Pro ran out, not new: told so, and sent straight
  // to the plans, since they have been through the questions before.
  const ended = status === 'free' && endedAt ? endedAt : null;
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
        {ended ? (
          <>
            <Text variant="title">Your Pro subscription has ended.</Text>
            <Text variant="body" tone="muted">
              It ran until {shortDate(ended.slice(0, 10))}. Renew to switch your filters and saved alerts back on.
            </Text>
          </>
        ) : (
          <>
            <Text variant="title">Every trade Congress makes, in one place.</Text>
            <Text variant="body" tone="muted">
              Follow the stock trades of House and Senate members, updated daily.
            </Text>
          </>
        )}
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
        {/* The disclosures are published free, as news (the U.S. law on these
            reports allows commercial use only by news media publishing to the
            general public); Pro pays for the tools. Said here, at the start,
            rather than on the plans screen. Plain text, not a link: Apple
            rejects links to a site that sells subscriptions outside the App
            Store. */}
        <Text variant="caption" tone="faint" style={styles.center}>
          Every trade is free to read on congtrade.com.
        </Text>
      </Animated.View>

      <View style={styles.footer}>
        <Button
          label={ended ? 'Renew Pro' : 'Get started'}
          kind="accent"
          onPress={() => {
            haptic.tap();
            router.push(ended ? '/paywall' : '/onboarding/goal');
          }}
        />
        {/* Not for someone already signed in: their way on is the button. */}
        {status === 'signed-out' ? (
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
        ) : null}
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
  center: { textAlign: 'center' },
});
