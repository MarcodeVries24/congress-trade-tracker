import { useAuth, useOAuth } from '@clerk/clerk-expo';
import { Stack, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { AccountPanel } from '@/components/account-panel';
import { EmailSignIn } from '@/components/email-sign-in';
import { LINKS, openPage } from '@/lib/links';
import { radius, useTheme } from '@/theme';
import { Icon, type IconName } from '@/ui/icon';
import { Logo } from '@/ui/logo';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

// Finishes any auth session left open by a previous launch, which otherwise
// leaves the in-app browser stuck the next time one is opened.
WebBrowser.maybeCompleteAuthSession();

type Provider = { strategy: 'oauth_google' | 'oauth_apple'; label: string; icon: IconName };

// The two connections the Clerk instance actually serves. Apple first on iOS,
// where Apple's guidelines expect it at least as prominent as any other.
const PROVIDERS: Provider[] =
  Platform.OS === 'ios'
    ? [
        { strategy: 'oauth_apple', label: 'Continue with Apple', icon: 'logo-apple' },
        { strategy: 'oauth_google', label: 'Continue with Google', icon: 'logo-google' },
      ]
    : [
        { strategy: 'oauth_google', label: 'Continue with Google', icon: 'logo-google' },
        { strategy: 'oauth_apple', label: 'Continue with Apple', icon: 'logo-apple' },
      ];

/**
 * Sign in, or, once signed in, the account screen.
 *
 * The same accounts as the website: Apple, Google, or an email with a password
 * or a one-time code. It closes itself once a sign-in started here succeeds,
 * so whatever opened it (the paywall, usually) can carry on.
 */
export default function SignInScreen() {
  const { c } = useTheme();
  const { isSignedIn } = useAuth();
  const router = useRouter();

  const openedSignedOut = useRef(!isSignedIn);
  useEffect(() => {
    if (isSignedIn && openedSignedOut.current && router.canGoBack()) router.back();
  }, [isSignedIn, router]);

  const google = useOAuth({ strategy: 'oauth_google' });
  const apple = useOAuth({ strategy: 'oauth_apple' });
  const [busy, setBusy] = useState<Provider['strategy'] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Warming the browser makes the first tap open faster on Android. Native
  // only: on web these throw outright rather than no-oping.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);

  const start = async (strategy: Provider['strategy']) => {
    setError(null);
    setBusy(strategy);
    try {
      const flow = strategy === 'oauth_google' ? google : apple;
      const { createdSessionId, setActive } = await flow.startOAuthFlow();
      if (createdSessionId && setActive) await setActive({ session: createdSessionId });
      else setError('Sign-in was cancelled.');
    } catch {
      setError('Could not complete sign-in. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  if (isSignedIn) {
    return (
      <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.account}>
        <Stack.Screen options={{ title: 'Account' }} />
        <AccountPanel />
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.fill, { backgroundColor: c.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Sign in' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.head}>
          <Logo size={28} />
          <Text variant="title" style={styles.center}>
            Welcome back
          </Text>
          <Text variant="callout" tone="muted" style={styles.center}>
            The same account as the website. Your plan and your saved alerts come with you.
          </Text>
        </View>

        <View style={styles.providers}>
          {PROVIDERS.map((p) => (
            <Tap
              key={p.strategy}
              disabled={busy !== null}
              feedback="tap"
              onPress={() => start(p.strategy)}
              style={[
                styles.provider,
                p.strategy === 'oauth_apple'
                  ? { backgroundColor: c.text, borderColor: c.text }
                  : { backgroundColor: c.surface, borderColor: c.borderStrong },
              ]}>
              {busy === p.strategy ? (
                <ActivityIndicator color={p.strategy === 'oauth_apple' ? c.background : c.text} />
              ) : (
                <>
                  <Icon name={p.icon} size={20} color={p.strategy === 'oauth_apple' ? c.background : c.text} />
                  <Text variant="bodyStrong" color={p.strategy === 'oauth_apple' ? c.background : c.text}>
                    {p.label}
                  </Text>
                </>
              )}
            </Tap>
          ))}
        </View>
        {error ? (
          <Text variant="caption" tone="loss" style={styles.center}>
            {error}
          </Text>
        ) : null}

        <View style={styles.divider}>
          <View style={[styles.rule, { backgroundColor: c.border }]} />
          <Text variant="caption" tone="faint">
            or with email
          </Text>
          <View style={[styles.rule, { backgroundColor: c.border }]} />
        </View>

        <EmailSignIn />

        <Text variant="footnote" tone="faint" style={styles.center}>
          By continuing you agree to the{' '}
          <Text variant="footnote" style={styles.link} onPress={() => openPage(LINKS.terms)}>
            Terms
          </Text>{' '}
          and the{' '}
          <Text variant="footnote" style={styles.link} onPress={() => openPage(LINKS.privacy)}>
            Privacy Policy
          </Text>
          .
        </Text>
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
  providers: { gap: 10 },
  provider: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 54,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rule: { flex: 1, height: StyleSheet.hairlineWidth },
  link: { fontWeight: '700', textDecorationLine: 'underline' },
});
