import { ClerkProvider } from '@clerk/clerk-expo';
import { DarkTheme, DefaultTheme, Redirect, Stack, ThemeProvider, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AccessProvider, useAccess } from '@/lib/access';
import { FollowsProvider } from '@/lib/follows';
import { OnboardingProvider, useOnboarding } from '@/lib/onboarding';
import { tokenCache } from '@/lib/token-cache';
import { useTheme } from '@/theme';
import { SplashOverlay } from '@/ui/splash-overlay';

SplashScreen.preventAutoHideAsync();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

/**
 * Sends a first run through onboarding, and everyone else straight to the app.
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
      {loaded && !done && !inFlow && !onSignIn ? <Redirect href="/onboarding" /> : null}
      {loaded && done && locked && !inFlow && !onSignIn ? <Redirect href="/paywall" /> : null}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="paywall" options={{ gestureEnabled: false, animation: 'fade' }} />
        <Stack.Screen name="trade/[id]" options={pushed} />
        <Stack.Screen name="politician/[slug]" options={pushed} />
        <Stack.Screen name="issuer/[slug]" options={pushed} />
        <Stack.Screen name="politicians" options={{ ...pushed, title: 'Politicians' }} />
        <Stack.Screen name="issuers" options={{ ...pushed, title: 'Companies' }} />
        <Stack.Screen name="news" options={{ ...pushed, title: 'News' }} />
        <Stack.Screen name="email-alerts" options={{ ...pushed, title: 'Email alerts' }} />
        <Stack.Screen name="settings" options={{ ...pushed, title: 'Settings' }} />
        <Stack.Screen name="help" options={{ ...pushed, title: 'Help & Support' }} />
        <Stack.Screen
          name="search"
          options={{ headerShown: false, presentation: 'modal', animation: 'fade_from_bottom' }}
        />
        <Stack.Screen
          name="swipe"
          options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: true }}
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
              <ThemeProvider value={navTheme}>
                <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
                <Navigation />
                <SplashOverlay />
              </ThemeProvider>
            </FollowsProvider>
          </OnboardingProvider>
        </AccessProvider>
      </ClerkProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
