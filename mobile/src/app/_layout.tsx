import { ClerkProvider } from '@clerk/clerk-expo';
import { DarkTheme, DefaultTheme, Redirect, Stack, ThemeProvider, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AccessProvider, useAccess } from '@/lib/access';
import { FollowsProvider } from '@/lib/follows';
import { OnboardingProvider, useOnboarding } from '@/lib/onboarding';
import { PushProvider } from '@/lib/push';
import { tokenCache } from '@/lib/token-cache';
import { MAX_CONTENT_WIDTH, useTheme } from '@/theme';
import { SplashOverlay } from '@/ui/splash-overlay';

SplashScreen.preventAutoHideAsync();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

/**
 * Sends a first run through onboarding, and everyone else straight to the app.
 * Anyone without Pro starts again at the welcome screen: someone whose
 * subscription has run out (kept to the end of the period they paid for) as
 * much as someone who has never had one, and from there through the questions
 * to the plans.
 *
 * Held back until storage has been read, because redirecting on a default would
 * show the flow again to someone who finished it last week.
 */
function Navigation() {
  const { c } = useTheme();
  const { loaded, done } = useOnboarding();
  const segments = useSegments();
  // Only from outside the flow. Rendering the redirect unconditionally while
  // onboarding was incomplete sent every step back to the first one.
  const inFlow = segments[0] === 'onboarding' || segments[0] === 'paywall';
  // The hard paywall. Sign-in stays reachable from it, because someone who
  // already subscribed, and a store reviewer, get in by signing in.
  const { locked } = useAccess();
  const onSignIn = segments[0] === 'sign-in';

  // Pushed screens get a flat header on the page colour with a bare back
  // chevron: the content carries the title, as in the apps this is modelled on.
  const pushed = {
    headerShown: true,
    title: '',
    headerShadowVisible: false,
    headerStyle: { backgroundColor: c.background },
    headerTintColor: c.text,
    headerTitleStyle: { fontWeight: '700' as const },
    headerBackButtonDisplayMode: 'minimal' as const,
  };
  const modal = { ...pushed, presentation: 'modal' as const };

  return (
    <>
      {loaded && (!done || locked) && !inFlow && !onSignIn ? <Redirect href="/onboarding" /> : null}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="paywall" options={{ gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="trade/[id]" options={pushed} />
        <Stack.Screen name="politician/[slug]" options={pushed} />
        <Stack.Screen name="issuer/[slug]" options={pushed} />
        <Stack.Screen name="issuers" options={{ ...pushed, title: 'Companies' }} />
        <Stack.Screen name="news" options={{ ...pushed, title: 'News' }} />
        <Stack.Screen name="timing" options={pushed} />
        <Stack.Screen name="email-alerts" options={{ ...pushed, title: 'Your alerts' }} />
        <Stack.Screen name="settings" options={{ ...pushed, title: 'Settings' }} />
        <Stack.Screen name="help" options={{ ...pushed, title: 'Help & Support' }} />
        <Stack.Screen
          name="search"
          options={{ headerShown: false, presentation: 'modal', animation: 'fade_from_bottom' }}
        />
        <Stack.Screen name="alert/[id]" options={{ ...modal, title: 'Alert' }} />
        <Stack.Screen name="sign-in" options={{ ...modal, title: 'Account' }} />
      </Stack>
    </>
  );
}

/**
 * A Stack at the root with the tabs as one screen inside it, so onboarding, the
 * paywall and every detail screen sit above the tab bar rather than inside it.
 *
 * ClerkProvider wraps everything because the paywall needs to know who is
 * signed in before any tab renders.
 */
export default function RootLayout() {
  const { scheme, c } = useTheme();

  if (!publishableKey) {
    // Failing loudly at the root beats every screen failing mysteriously later.
    throw new Error('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not set. Copy .env.example to .env.local.');
  }

  // The navigation theme carries our page colour, so no screen flashes the
  // library's own white or black between transitions.
  const navTheme = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        background: c.background,
        card: c.surface,
        text: c.text,
        border: c.border,
        primary: c.accent,
      },
    };
  }, [scheme, c]);

  return (
    <GestureHandlerRootView style={styles.fill}>
      <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
        <AccessProvider>
          <OnboardingProvider>
            <FollowsProvider>
              <PushProvider>
                <ThemeProvider value={navTheme}>
                  <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
                  {/* One centred column on an iPad; the full width on a phone. */}
                  <View style={[styles.fill, { backgroundColor: c.background }]}>
                    <View style={styles.column}>
                      <Navigation />
                    </View>
                  </View>
                  <SplashOverlay />
                </ThemeProvider>
              </PushProvider>
            </FollowsProvider>
          </OnboardingProvider>
        </AccessProvider>
      </ClerkProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { flex: 1, width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
});
