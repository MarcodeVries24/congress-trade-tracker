/**
 * Where the CongTrade app is, in each store.
 *
 * The App Store id is the number in the app's App Store Connect address; it
 * also drives Safari's own "Open in the app" banner (see app/layout.tsx).
 * Both addresses answer 404 until the app is live in that store.
 */
export const APP_STORE_ID = "6817481190";
export const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;
export const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.congtrade.app";

/** Where "Get the app" links point: the home page's app section. */
export const GET_THE_APP_HREF = "/#get-the-app";
