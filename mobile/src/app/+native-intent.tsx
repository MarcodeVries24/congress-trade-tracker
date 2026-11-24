/**
 * Links from the system, before the router opens them as a page.
 *
 * Coming back from an Apple or Google sign-in is such a link
 * (congtrade://oauth-native-callback?...). On iOS the sign-in sheet keeps it to
 * itself, but on Android it reaches the whole app, and the router drew its
 * "Unmatched Route" page over a sign-in that had worked. The browser session
 * in AuthOptions hears the link by itself, so the router only has to leave it
 * alone: the screen that started the sign-in is still there and moves on.
 */
const SIGN_IN_CALLBACK = /\/oauth-native-callback\/?(?:[?#]|$)/;

export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  if (!SIGN_IN_CALLBACK.test(path)) return path;
  // Started by the link: Android closed the app while the browser was open, so
  // there is no sign-in left to finish and no screen to stay on.
  return initial ? '/' : null;
}
