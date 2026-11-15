import { Alert, Platform } from 'react-native';

type Wording = { title: string; message: string; confirm: string };

const SIGN_OUT: Wording = {
  title: 'Sign out?',
  message: 'Push alerts to this phone stop until you sign in again.',
  confirm: 'Sign out',
};

/**
 * Asks before signing out, wherever the button is (More, Settings, Account,
 * and "Switch account" on the plans screen, which passes its own wording and
 * what to do once signed out).
 *
 * Signing out is easy to undo but annoying to hit by accident: it stops push
 * alerts on this phone, and getting back in means an email code or a
 * password. A native dialog, with Cancel as the safe choice; the browser's own
 * confirm on the web preview, where Alert does nothing.
 */
export function confirmSignOut(
  signOut: () => Promise<void>,
  { wording = SIGN_OUT, then }: { wording?: Wording; then?: () => void } = {}
) {
  const run = () => void signOut().then(() => then?.());
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm(`${wording.title} ${wording.message}`)) run();
    return;
  }
  Alert.alert(wording.title, wording.message, [
    { text: 'Cancel', style: 'cancel' },
    { text: wording.confirm, style: 'destructive', onPress: run },
  ]);
}
