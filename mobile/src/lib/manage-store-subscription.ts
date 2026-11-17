import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Linking, Platform } from 'react-native';

import { LINKS, openPage } from '@/lib/links';

const ANDROID_PACKAGE = 'com.congtrade.app';

/**
 * A store's own subscriptions page, handed to the system rather than opened
 * in the in-app browser. On a phone that link opens the Play Store or App
 * Store app; through the in-app browser it opened the store app *and* left
 * an empty browser window behind, a second, black CongTrade in the app
 * switcher. The web preview has no store app, so it gets a tab.
 */
function openStorePage(url: string): void {
  if (Platform.OS === 'web') openPage(url);
  else Linking.openURL(url).catch(() => openPage(url));
}

/**
 * Opens wherever a store subscription is managed or cancelled.
 *
 * On an iPhone that is Apple's own sheet, inside the app: the one Apple
 * recommends, and the only place a TestFlight or sandbox subscription shows
 * up at all. The App Store's subscriptions page lists real purchases only, so
 * a tester sent there finds nothing to cancel. The page is still the
 * fallback, for Expo Go (which has no expo-iap) and if the sheet fails.
 *
 * On Android it is Google Play's subscriptions page, which lists test
 * purchases too, narrowed to this app by its package name.
 */
export function manageStoreSubscription(store: 'apple' | 'google'): void {
  if (store === 'google') {
    openStorePage(`${LINKS.manageGoogle}?package=${ANDROID_PACKAGE}`);
    return;
  }
  if (Platform.OS !== 'ios' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    openStorePage(LINKS.manageApple);
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { showManageSubscriptionsIOS } = require('expo-iap') as typeof import('expo-iap');
  showManageSubscriptionsIOS().catch(() => openStorePage(LINKS.manageApple));
}
