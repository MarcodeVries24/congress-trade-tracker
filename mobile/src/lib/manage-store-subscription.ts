import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

import { LINKS, openPage } from '@/lib/links';

/**
 * Opens wherever a store subscription is managed or cancelled.
 *
 * On an iPhone that is Apple's own sheet, inside the app: the one Apple
 * recommends, and the only place a TestFlight or sandbox subscription shows
 * up at all. The App Store's subscriptions web page lists real purchases
 * only, so a tester sent there finds nothing to cancel. The page is still the
 * fallback, for Expo Go (which has no expo-iap) and if the sheet fails.
 * Google Play's page lists test purchases too, so Android keeps it.
 */
export function manageStoreSubscription(store: 'apple' | 'google'): void {
  if (store === 'google' || Platform.OS !== 'ios') {
    openPage(store === 'google' ? LINKS.manageGoogle : LINKS.manageApple);
    return;
  }
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    openPage(LINKS.manageApple);
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { showManageSubscriptionsIOS } = require('expo-iap') as typeof import('expo-iap');
  showManageSubscriptionsIOS().catch(() => openPage(LINKS.manageApple));
}
