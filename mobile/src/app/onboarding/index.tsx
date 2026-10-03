import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccess } from '@/lib/access';
import { haptic } from '@/lib/haptics';
import { useOnboarding } from '@/lib/onboarding';
import { useTheme } from '@/theme';
import { Button } from '@/ui/button';
import { CongBadge } from '@/ui/cong-mascot';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

// Room the text and buttons below Cong need, so he can take the rest.
const BELOW = 300;

/**
 * The first screen anyone sees: Cong, the mascot, waving hello, one line of
 * promise and the way in. Everything fits on one screen with no scrolling;
 * Cong grows or shrinks to the space the phone leaves him, and from here he
 * asks the setup questions himself.
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
        <Text variant="display">Every trade Congress makes, in one place.</Text>
        <Text variant="body" tone="muted">
          Follow the stock trades of House and Senate members as they&apos;re filed.
        </Text>
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
  copy: { paddingHorizontal: 24, gap: 10 },
  footer: { paddingHorizontal: 20, paddingTop: 22, gap: 12 },
  signIn: { alignItems: 'center', paddingVertical: 4 },
  bold: { fontWeight: '700' },
});
