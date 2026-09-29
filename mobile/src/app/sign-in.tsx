import { useOAuth, useAuth, useUser } from '@clerk/clerk-expo';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, useColorScheme } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';

// Finishes any auth session left open by a previous launch, which otherwise
// leaves the in-app browser stuck the next time one is opened.
WebBrowser.maybeCompleteAuthSession();

type Provider = { strategy: 'oauth_google' | 'oauth_apple'; label: string };

// The two connections the Clerk instance actually serves. Facebook is
// deliberately absent: the connection was never created.
const PROVIDERS: Provider[] = [
  { strategy: 'oauth_google', label: 'Continue with Google' },
  { strategy: 'oauth_apple', label: 'Continue with Apple' },
];

export default function SignInScreen() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const { isSignedIn, signOut } = useAuth();
  const { user } = useUser();

  const google = useOAuth({ strategy: 'oauth_google' });
  const apple = useOAuth({ strategy: 'oauth_apple' });

  const [busy, setBusy] = useState<Provider['strategy'] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Warming the browser makes the first tap open noticeably faster on Android.
  useEffect(() => {
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);

  // Not memoised: it only ever runs from onPress, and the two OAuth flow
  // objects are rebuilt by Clerk on most renders, so a useCallback around it
  // would be re-created every time regardless.
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
      <ThemedView style={styles.screen}>
        <ThemedText style={styles.title}>Signed in</ThemedText>
        <ThemedText style={[styles.body, { color: colors.textSecondary }]}>
          {user?.primaryEmailAddress?.emailAddress ?? 'Your account is connected.'}
        </ThemedText>
        <Pressable onPress={() => signOut()} style={[styles.button, { backgroundColor: colors.backgroundElement }]}>
          <ThemedText style={styles.buttonLabel}>Sign out</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <ThemedText style={styles.title}>Your CongTrade account</ThemedText>
      <ThemedText style={[styles.body, { color: colors.textSecondary }]}>
        The same account as the website. Your plan and your saved alerts come with you.
      </ThemedText>

      <View style={styles.buttons}>
        {PROVIDERS.map((p) => (
          <Pressable
            key={p.strategy}
            disabled={busy !== null}
            onPress={() => start(p.strategy)}
            style={[styles.button, { backgroundColor: colors.backgroundElement, opacity: busy ? 0.6 : 1 }]}>
            {busy === p.strategy ? <ActivityIndicator /> : <ThemedText style={styles.buttonLabel}>{p.label}</ThemedText>}
          </Pressable>
        ))}
      </View>

      {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, justifyContent: 'center', gap: 10, padding: 28 },
  title: { fontSize: 22, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 20 },
  buttons: { marginTop: 16, gap: 10 },
  button: { alignItems: 'center', justifyContent: 'center', minHeight: 48, borderRadius: 12, paddingHorizontal: 18 },
  buttonLabel: { fontSize: 15, fontWeight: '600' },
  error: { marginTop: 12, fontSize: 13, color: '#d6455d' },
});
