import { useAuth } from '@clerk/clerk-expo';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { AccountPanel } from '@/components/account-panel';
import { AuthOptions } from '@/components/auth-options';
import { useTheme } from '@/theme';
import { Cong } from '@/ui/cong';
import { Text } from '@/ui/text';

/**
 * Sign in, or, once signed in, the account screen.
 *
 * The same accounts as the website: Apple, Google, or an email with a password
 * or a one-time code (see AuthOptions). It closes itself once a sign-in
 * started here succeeds, so whatever opened it (the paywall, usually) can
 * carry on.
 *
 * Opened with `intent=create` by the plans screen, for someone who wants to
 * subscribe but has no account yet (they passed the onboarding's account step
 * with "Not now"): it says "Create your account" rather than greeting a
 * stranger with "Welcome back". The buttons are the same either way, as
 * Apple, Google and an unknown email address all make an account.
 */
export default function SignInScreen() {
  const { c } = useTheme();
  const { isSignedIn } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ intent?: string; manage?: string }>();
  const creating = params.intent === 'create';
  // Settings > Account: the one way in that also offers deleting the account.
  const managing = params.manage === '1';

  // Decided once, on opening. While it closes it stays the sign-in screen,
  // title and all: turning into the account screen on the way out changed the
  // header of a screen that was being removed, which crashed on Android.
  const [closesItself] = useState(() => !isSignedIn && router.canGoBack());
  useEffect(() => {
    if (isSignedIn && closesItself) router.back();
  }, [isSignedIn, closesItself, router]);

  if (isSignedIn && !closesItself) {
    return (
      <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.account}>
        <Stack.Screen options={{ title: 'Account' }} />
        <AccountPanel showDelete={managing} />
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.fill, { backgroundColor: c.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: creating ? 'Create account' : 'Sign in' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.head}>
          <Cong mood={creating ? 'turn-on-alerts' : 'welcome-back'} width={96} />
          <Text variant="title" style={styles.center}>
            {creating ? 'Create your account' : 'Welcome back'}
          </Text>
          <Text variant="callout" tone="muted" style={styles.center}>
            {creating
              ? 'Pro is saved to your account, so it works on this phone and on congtrade.com. Already have one? Sign in the same way.'
              : 'The same account as the website. Your plan and your saved alerts come with you.'}
          </Text>
        </View>

        <AuthOptions />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  account: { padding: 20, paddingBottom: 48 },
  content: { padding: 24, gap: 18, paddingBottom: 48 },
  head: { alignItems: 'center', gap: 8, paddingBottom: 6 },
  center: { textAlign: 'center' },
});
