import { useAuth, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAccess } from '@/lib/access';
import { API_BASE } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { LINKS, SITE, openPage } from '@/lib/links';
import { radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/avatar';
import { Button } from '@/ui/button';
import { Icon } from '@/ui/icon';
import { ListRow } from '@/ui/list-row';
import { Pill } from '@/ui/pill';
import { Group } from '@/ui/section';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

/**
 * The signed-in account: who, which plan, sign out, and delete.
 *
 * Deletion is here because Apple requires an app that creates accounts to let
 * people delete them from inside the app, not only by email. It asks once, in
 * place, rather than through Alert, which does nothing on the web preview.
 *
 * A store subscription is named before anything is deleted. Deleting the
 * account cannot stop Apple or Google from charging, only the person can, and
 * finding that out from next week's receipt would be the worst way to learn it.
 */
export function AccountPanel() {
  const { c } = useTheme();
  const router = useRouter();
  const { signOut, getToken } = useAuth();
  const { user } = useUser();
  const { status, renewing } = useAccess();

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storeRenewing = renewing.filter((p): p is 'apple' | 'google' => p === 'apple' || p === 'google');
  const name = user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Your account';

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
      haptic.success();
      // The session died with the user, so this only clears it off the device.
      await signOut().catch(() => {});
      router.replace('/paywall');
    } catch {
      setError('Could not reach CongTrade. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.identity}>
        <Avatar uri={user?.imageUrl} name={name} size={84} />
        <Text variant="title" style={styles.center}>
          {name}
        </Text>
        {user?.fullName ? (
          <Text variant="callout" tone="muted">
            {user.primaryEmailAddress?.emailAddress}
          </Text>
        ) : null}
        <View style={styles.plan}>
          {status === 'pro' ? (
            <Pill label="CongTrade Pro" tone="accent" />
          ) : (
            <Pill label="No active plan" tone="neutral" solid={false} />
          )}
        </View>
      </View>

      <Group>
        <ListRow
          icon="card-outline"
          label="Manage subscription"
          detail={
            renewing.includes('stripe')
              ? 'Billed on congtrade.com'
              : storeRenewing.length
                ? `Billed by ${storeRenewing[0] === 'apple' ? 'the App Store' : 'Google Play'}`
                : 'No subscription renewing'
          }
          onPress={() =>
            openPage(
              renewing.includes('stripe')
                ? `${SITE}/account`
                : storeRenewing[0] === 'google'
                  ? LINKS.manageGoogle
                  : LINKS.manageApple
            )
          }
        />
        <ListRow icon="log-out-outline" label="Sign out" chevron={false} onPress={() => void signOut()} last />
      </Group>

      {!confirming ? (
        <Tap
          onPress={() => {
            haptic.select();
            setConfirming(true);
          }}
          style={styles.deleteLink}>
          <Text variant="callout" tone="loss" style={styles.bold}>
            Delete account
          </Text>
        </Tap>
      ) : (
        <View style={[styles.confirm, { backgroundColor: c.surface, borderColor: c.loss }]}>
          <View style={[styles.warnIcon, { backgroundColor: c.lossSoft }]}>
            <Icon name="warning" size={22} color={c.loss} />
          </View>
          <Text variant="subhead">Delete your account?</Text>
          <Text variant="callout" tone="muted">
            This deletes your account, your sign-in and your saved alerts, straight away and for good. Billing records
            are kept for seven years because Dutch law requires it. Follows on this phone stay until you remove the app.
          </Text>

          {storeRenewing.map((store) => (
            <View key={store} style={[styles.storeWarning, { backgroundColor: c.lossSoft }]}>
              <Text variant="caption">
                Your {store === 'apple' ? 'App Store' : 'Google Play'} subscription will keep renewing. Deleting your
                account does not cancel it. Cancel it first.
              </Text>
              <Tap onPress={() => openPage(store === 'apple' ? LINKS.manageApple : LINKS.manageGoogle)}>
                <Text variant="caption" style={[styles.bold, styles.underline]}>
                  Manage subscriptions
                </Text>
              </Tap>
            </View>
          ))}

          <Button label="Delete permanently" kind="danger" loading={busy} onPress={deleteAccount} />
          <Button
            label="Keep my account"
            kind="ghost"
            disabled={busy}
            onPress={() => {
              setConfirming(false);
              setError(null);
            }}
          />
        </View>
      )}

      {error ? (
        <Text variant="caption" tone="loss" style={styles.center}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 20 },
  identity: { alignItems: 'center', gap: 6 },
  center: { textAlign: 'center' },
  plan: { marginTop: 6 },
  bold: { fontWeight: '700' },
  underline: { textDecorationLine: 'underline' },
  deleteLink: { alignItems: 'center', paddingVertical: 6 },
  confirm: { gap: 12, padding: 18, borderRadius: radius.xl, borderWidth: 1 },
  warnIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  storeWarning: { gap: 6, padding: 12, borderRadius: radius.md },
});
