import { useOAuth } from '@clerk/clerk-expo';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { EmailSignIn } from '@/components/email-sign-in';
import { LINKS, openPage } from '@/lib/links';
import { radius, useTheme } from '@/theme';
import { Icon, type IconName } from '@/ui/icon';
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
 * The ways in: Apple, Google, or an email address (which signs in, or creates
 * an account for an address Clerk does not know). The same for signing in and
 * for signing up, as Apple and Google make an account on first use too, so
 * the sign-in screen and the onboarding's account step share it.
 *
 * Whoever shows it notices the sign-in through Clerk's isSignedIn and moves
 * on; this only gets the person signed in. `extra` goes under the email
 * field, above the terms (the onboarding's "Already have an account?").
 */
export function AuthOptions({ extra }: { extra?: ReactNode } = {}) {
  const { c } = useTheme();
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

  return (
    <View style={styles.wrap}>
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

      {extra}

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
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 18 },
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
