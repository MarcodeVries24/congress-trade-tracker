import { Alert, Platform } from 'react-native';

/**
 * Asks before signing out, wherever the button is (More, Settings, Account).
 *
 * Signing out is easy to undo but annoying to hit by accident: it stops push
 * alerts on this phone, and getting back in means an email code or a
 * password. A native dialog, with Cancel as the safe choice; the browser's own
 * confirm on the web preview, where Alert does nothing.
 */
export function confirmSignOut(signOut: () => Promise<void>) {
  const run = () => void signOut();
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && window.confirm('Sign out of CongTrade?')) run();
    return;
  }
  Alert.alert('Sign out?', 'Push alerts to this phone stop until you sign in again.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: run },
  ]);
}
