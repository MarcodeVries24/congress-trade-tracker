import * as WebBrowser from 'expo-web-browser';
import { Linking, Platform } from 'react-native';

/** The website's own pages, always from production so a dev build never links to localhost. */
export const SITE = 'https://www.congtrade.com';
export const SUPPORT_EMAIL = 'contact@congtrade.com';

export const LINKS = {
  privacy: `${SITE}/privacy`,
  terms: `${SITE}/terms`,
  disclaimer: `${SITE}/disclaimer`,
  about: `${SITE}/about`,
  deleteAccount: `${SITE}/delete-account`,
  manageApple: 'https://apps.apple.com/account/subscriptions',
  manageGoogle: 'https://play.google.com/store/account/subscriptions',
};

/**
 * Where every trade in the app comes from: the government's own disclosure
 * sites, linked from Help. Google Play requires an app that shows government
 * information to link its official sources and say it is not a government
 * body; the store description does the same.
 */
export const OFFICIAL_SOURCES = [
  {
    label: 'U.S. House of Representatives, Office of the Clerk: Financial Disclosure Reports',
    url: 'https://disclosures-clerk.house.gov/FinancialDisclosure',
  },
  {
    label: 'U.S. Senate: Financial Disclosures (eFD)',
    url: 'https://efdsearch.senate.gov/search/home/',
  },
] as const;

/** Opens a page in the in-app browser, or a new tab on the web preview. */
export function openPage(url: string): void {
  if (Platform.OS === 'web') window.open(url, '_blank', 'noopener');
  else void WebBrowser.openBrowserAsync(url);
}

export function emailSupport(subject: string): void {
  void Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`);
}
