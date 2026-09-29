import { ClerkProvider } from '@clerk/clerk-expo';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { tokenCache } from '@/lib/token-cache';

SplashScreen.preventAutoHideAsync();

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

/**
 * A Stack at the root with the tabs as one screen inside it.
 *
 * The tabs are not the root on purpose: onboarding, the paywall and a trade
 * detail all have to sit above the tab bar rather than inside it, and a hard
 * paywall means the first thing a new install sees is not a tab at all.
 *
 * ClerkProvider wraps everything because the paywall will need to know who is
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
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="sign-in" options={{ presentation: 'modal', headerShown: true, title: 'Sign in' }} />
        </Stack>
      </ThemeProvider>
    </ClerkProvider>
  );
}
