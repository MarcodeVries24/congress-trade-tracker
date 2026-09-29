import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Where Clerk keeps the session token between launches.
 *
 * The Keychain on iOS and Keystore on Android, rather than AsyncStorage: this
 * token is a bearer credential for someone's account, and AsyncStorage is a
 * plain file that anything with filesystem access on a rooted device can read.
 *
 * SecureStore has no implementation on web, so the web target gets no cache at
 * all and simply signs in again. That is correct rather than a gap: Expo web is
 * a development convenience here, not a shipping target.
 */
export const tokenCache = {
  async getToken(key: string): Promise<string | null> {
    if (Platform.OS === 'web') return null;
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      // A corrupt or unreadable entry must not stop the app booting; the
      // worst case is being asked to sign in again.
      await SecureStore.deleteItemAsync(key).catch(() => {});
      return null;
    }
  },
  async saveToken(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') return;
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // Losing the cache costs a sign-in, not a session.
    }
  },
};
