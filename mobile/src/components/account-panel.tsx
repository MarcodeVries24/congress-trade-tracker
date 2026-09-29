import { useAuth, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View, useColorScheme } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';
import { useAccess } from '@/lib/access';
import { API_BASE } from '@/lib/api';

const MANAGE_SUBSCRIPTIONS = {
  apple: 'https://apps.apple.com/account/subscriptions',
  google: 'https://play.google.com/store/account/subscriptions',
} as const;

/**
 * The signed-in account: who, which plan, sign out, and delete.
 *
 * Deletion is here because Apple requires an app that creates accounts to let
 * people delete them from inside the app, not only by email. It asks once,
 * in place, rather than through Alert, which does nothing on the web preview.
 *
 * A store subscription is named before anything is deleted. Deleting the
 * account cannot stop Apple or Google from charging, only the person can, and
 * finding that out from next week's receipt would be the worst way to learn it.
 */
export function AccountPanel() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const router = useRouter();
  const { signOut, getToken } = useAuth();
  const { user } = useUser();
  const { status, renewing } = useAccess();

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storeRenewing = renewing.filter((p): p is 'apple' | 'google' => p === 'apple' || p === 'google');

  const deleteAccount = async () => {
    setError(null);
    setBusy(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/account`, {
        method: 'DELETE',
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? `Could not delete the account (${res.status}).`);
        return;
      }
      // The session died with the user, so this only clears it off the device.
      await signOut().catch(() => {});
      router.replace('/paywall');
    } catch {
      setError('Could not reach CongTrade. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const plan = status === 'pro' ? 'CongTrade Pro' : status === 'free' ? 'No active plan' : null;

  return (
    <View style={styles.wrap}>
      <ThemedText style={styles.title}>Your account</ThemedText>
      <ThemedText style={[styles.body, { color: colors.textSecondary }]}>
        {user?.primaryEmailAddress?.emailAddress ?? 'Signed in'}
      </ThemedText>
      {plan ? <ThemedText style={[styles.body, { color: colors.textSecondary }]}>{plan}</ThemedText> : null}

      <Pressable
        onPress={() => signOut()}
        disabled={busy}
        style={[styles.button, { backgroundColor: colors.backgroundElement }]}>
        <ThemedText style={styles.buttonLabel}>Sign out</ThemedText>
      </Pressable>

      {!confirming ? (
        <Pressable onPress={() => setConfirming(true)} style={styles.link}>
          <ThemedText style={styles.danger}>Delete account</ThemedText>
        </Pressable>
      ) : (
        <View style={[styles.confirm, { backgroundColor: colors.backgroundElement }]}>
          <ThemedText style={styles.confirmTitle}>Delete your account?</ThemedText>
          <ThemedText style={[styles.body, { color: colors.textSecondary }]}>
            This deletes your account, your sign-in and your saved alerts, straight away and for good. Billing records
            are kept for seven years because Dutch law requires it.
          </ThemedText>

          {storeRenewing.map((store) => (
            <View key={store} style={styles.storeWarning}>
              <ThemedText style={styles.warningText}>
                Your {store === 'apple' ? 'App Store' : 'Google Play'} subscription will keep renewing. Deleting your
                account does not cancel it. Cancel it first.
              </ThemedText>
              <Pressable onPress={() => Linking.openURL(MANAGE_SUBSCRIPTIONS[store])}>
                <ThemedText style={styles.warningLink}>Manage subscriptions</ThemedText>
              </Pressable>
            </View>
          ))}

          <Pressable
            onPress={deleteAccount}
            disabled={busy}
            style={[styles.button, styles.deleteButton, { opacity: busy ? 0.6 : 1 }]}>
            {busy ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText style={styles.deleteLabel}>Delete permanently</ThemedText>
            )}
          </Pressable>
          <Pressable
            onPress={() => {
              setConfirming(false);
              setError(null);
            }}
            disabled={busy}
            style={styles.link}>
            <ThemedText style={[styles.linkLabel, { color: colors.textSecondary }]}>Keep my account</ThemedText>
          </Pressable>
        </View>
      )}

      {error ? <ThemedText style={styles.error}>{error}</ThemedText> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  title: { fontSize: 22, fontWeight: '700' },
  body: { fontSize: 14, lineHeight: 20 },
  button: { alignItems: 'center', justifyContent: 'center', minHeight: 48, borderRadius: 12, paddingHorizontal: 18 },
  buttonLabel: { fontSize: 15, fontWeight: '600' },
  link: { alignItems: 'center', paddingVertical: 10 },
  linkLabel: { fontSize: 14 },
  danger: { fontSize: 14, fontWeight: '600', color: '#d6455d' },
  confirm: { marginTop: 8, gap: 10, padding: 16, borderRadius: 14 },
  confirmTitle: { fontSize: 16, fontWeight: '700' },
  storeWarning: { gap: 4, padding: 12, borderRadius: 10, backgroundColor: 'rgba(214,69,93,0.12)' },
  warningText: { fontSize: 13, lineHeight: 18 },
  warningLink: { fontSize: 13, fontWeight: '700', color: '#3b7ddd' },
  deleteButton: { backgroundColor: '#d6455d' },
  deleteLabel: { fontSize: 15, fontWeight: '700', color: '#ffffff' },
  error: { fontSize: 13, color: '#d6455d' },
});
