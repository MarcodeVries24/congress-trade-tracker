import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccess } from '@/lib/access';
import { fetchTrades, type Trade } from '@/lib/api';
import { amountLabel, assetLabel, memberName, tradePill, tradeTone, tradeVerb } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useOnboarding } from '@/lib/onboarding';
import { radius, shadow, useTheme } from '@/theme';
import { Avatar } from '@/ui/avatar';
import { Button } from '@/ui/button';
import { Icon, type IconName } from '@/ui/icon';
import { Brand } from '@/ui/logo';
import { Pill } from '@/ui/pill';
import { Skeleton } from '@/ui/skeleton';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

const POINTS: { icon: IconName; text: string }[] = [
  { icon: 'document-text', text: 'Every disclosed trade, straight from the filings' },
  { icon: 'flash', text: 'On your phone within hours of being published' },
  { icon: 'star', text: 'Follow politicians, see every trade they make' },
];

/**
 * The first screen anyone sees.
 *
 * Shows the product rather than describing it: three real trades from the
 * latest filings, fanned like cards, above one line of promise. The trades
 * are fetched, not illustrated, because a made-up "Senator bought NVIDIA"
 * would be the one lie on a screen whose job is to earn trust.
 */
export default function WelcomeScreen() {
  const { c, scheme } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [trades, setTrades] = useState<Trade[] | null>(null);
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

  useEffect(() => {
    const controller = new AbortController();
    fetchTrades({ limit: 200, assetTypes: ['ST'] }, { signal: controller.signal })
      .then((res) => {
        // Three different people: one busy filer would otherwise fill the stack.
        const seen = new Set<string>();
        const picks = res.data.filter((t) => {
          const who = t.member_slug ?? t.member_name;
          if (!t.photo_url || !t.ticker || seen.has(who)) return false;
          seen.add(who);
          return true;
        });
        setTrades(picks.slice(0, 3));
      })
      .catch(() => setTrades([]));
    return () => controller.abort();
  }, []);

  const tilt = [-3, 2, -1];

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 14 }]}
        showsVerticalScrollIndicator={false}>
        <Animated.View entering={FadeInDown.duration(400)} style={styles.logo}>
          <Brand size={24} />
        </Animated.View>

        <Animated.View entering={FadeInDown.duration(450).delay(120)} style={styles.copy}>
          <Text variant="display">See what Congress trades, the moment it&apos;s filed.</Text>
          <Text variant="body" tone="muted">
            CongTrade reads the disclosures the House and the Senate publish and turns them into a feed you can follow.
          </Text>
        </Animated.View>

        <Text variant="label" tone="faint" style={styles.examples}>
          RECENTLY FILED
        </Text>
        <View style={styles.stack}>
          {(trades ?? [null, null, null]).map((t, i) => (
            <Animated.View
              key={t ? t.id : i}
              entering={FadeInUp.duration(500).delay(300 + i * 110)}
              style={[
                styles.tradeCard,
                { backgroundColor: c.surface, borderColor: c.border, transform: [{ rotate: `${tilt[i] ?? 0}deg` }] },
                scheme === 'light' ? shadow.raised : null,
              ]}>
              {t ? (
                <>
                  <Avatar uri={t.photo_url} name={memberName(t)} party={t.party} size={44} />
                  <View style={styles.flex}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {memberName(t)}
                    </Text>
                    <Text variant="caption" tone="muted" numberOfLines={1}>
                      {tradeVerb(t.transaction_type)} {assetLabel(t)} ({t.ticker})
                    </Text>
                    <Text variant="footnote" tone="faint">
                      {amountLabel(t.amount_range)}
                    </Text>
                  </View>
                  <Pill label={tradePill(t.transaction_type)} tone={tradeTone(t.transaction_type)} />
                </>
              ) : (
                <>
                  <Skeleton width={44} height={44} round={22} />
                  <View style={[styles.flex, { gap: 8 }]}>
                    <Skeleton width="60%" height={13} />
                    <Skeleton width="85%" height={11} />
                  </View>
                </>
              )}
            </Animated.View>
          ))}
        </View>

        <Animated.View entering={FadeInDown.duration(450).delay(640)} style={styles.points}>
          {POINTS.map((p) => (
            <View key={p.text} style={styles.point}>
              <View style={[styles.pointIcon, { backgroundColor: c.surfaceMuted }]}>
                <Icon name={p.icon} size={18} color={c.primary} />
              </View>
              <Text variant="callout" style={styles.flex}>
                {p.text}
              </Text>
            </View>
          ))}
        </Animated.View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <Button
          label="Get started"
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
  content: { paddingHorizontal: 22, paddingBottom: 24 },
  logo: { alignItems: 'center' },
  examples: { marginTop: 30 },
  stack: { marginTop: 12, gap: 10 },
  tradeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  flex: { flex: 1, gap: 2 },
  copy: { marginTop: 28, gap: 12 },
  points: { marginTop: 28, gap: 14 },
  point: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pointIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  footer: { paddingHorizontal: 20, paddingTop: 10, gap: 12 },
  signIn: { alignItems: 'center', paddingVertical: 4 },
  bold: { fontWeight: '700' },
});
