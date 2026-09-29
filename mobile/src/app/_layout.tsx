import { ClerkProvider } from '@clerk/clerk-expo';
import { DarkTheme, DefaultTheme, Redirect, Stack, ThemeProvider, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AccessProvider, useAccess } from '@/lib/access';
import { OnboardingProvider, useOnboarding } from '@/lib/onboarding';
import { tokenCache } from '@/lib/token-cache';

SplashScreen.preventAutoHideAsync();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

/**
 * Sends a first run through onboarding, and everyone else straight to the app.
 *
 * Held back until storage has been read, because redirecting on a default would
 * show the flow again to someone who finished it last week. Rendering the stack
 * meanwhile keeps the splash in place rather than flashing an empty screen.
 */
function Navigation() {
  const { loaded, done } = useOnboarding();
  const segments = useSegments();
  // Only from outside the flow. Rendering the redirect unconditionally while
  // onboarding was incomplete sent every step back to the first one: the URL
  // advanced and the welcome screen kept rendering underneath it.
  const inFlow = segments[0] === 'onboarding' || segments[0] === 'paywall';
  // The hard paywall. Sign-in stays reachable from it, because someone who
  // already subscribed, and a store reviewer, get in by signing in.
  const { locked } = useAccess();
  const onSignIn = segments[0] === 'sign-in';

  return (
    <>
      {loaded && !done && !inFlow ? <Redirect href="/onboarding" /> : null}
      {loaded && done && locked && !inFlow && !onSignIn ? <Redirect href="/paywall" /> : null}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="paywall" options={{ gestureEnabled: false }} />
        <Stack.Screen name="trade/[id]" options={{ headerShown: true }} />
        <Stack.Screen name="politician/[slug]" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="issuer/[slug]" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="alert/[id]" options={{ presentation: 'modal', headerShown: true, title: 'Alert' }} />
        <Stack.Screen name="sign-in" options={{ presentation: 'modal', headerShown: true, title: 'Sign in' }} />
      </Stack>
    </>
  );
}

/**
 * A Stack at the root with the tabs as one screen inside it.
 *
 * The tabs are not the root on purpose: onboarding, the paywall and a trade
 * detail all have to sit above the tab bar rather than inside it, and a hard
 * paywall means the first thing a new install sees is not a tab at all.
 *
 * ClerkProvider wraps everything because the paywall needs to know who is
 * signed in before any tab renders. The same accounts as the website, the same
 * Google and Apple buttons, and the same session the API routes already trust.
 */
export default function RootLayout() {
  const colorScheme = useColorScheme();

  if (!publishableKey) {
    // Failing loudly at the root beats every screen failing mysteriously later.
    throw new Error('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not set. Copy .env.example to .env.local.');
  }

  return (
    <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
      <AccessProvider>
        <OnboardingProvider>
          <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
            <AnimatedSplashOverlay />
            <Navigation />
          </ThemeProvider>
        </OnboardingProvider>
      </AccessProvider>
    </ClerkProvider>
  );
}
