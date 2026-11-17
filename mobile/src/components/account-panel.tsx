import { useAuth } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAccess } from '@/lib/access';
import { API_BASE } from '@/lib/api';
import { confirmSignOut } from '@/lib/confirm-sign-out';
import { haptic } from '@/lib/haptics';
import { openPage } from '@/lib/links';
import { manageStoreSubscription } from '@/lib/manage-store-subscription';
import { usePush } from '@/lib/push';
import { ProfileEditor } from '@/components/profile-editor';
import { radius, useTheme } from '@/theme';
import { Button } from '@/ui/button';
import { Icon } from '@/ui/icon';
import { ListRow } from '@/ui/list-row';
import { Pill } from '@/ui/pill';
import { Group } from '@/ui/section';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

/**
 * The signed-in account: who (and their name and photo, see ProfileEditor),
 * which plan, managing or cancelling it, sign out, and delete.
 *
 * Deletion is here because Apple requires an app that creates accounts to let
 * people delete them from inside the app, not only by email. It shows only
 * with `showDelete`, which Settings > Account passes: the same page opened
 * from the avatar or the profile card is for the plan and signing out. It asks once, in
 * place, rather than through Alert, which does nothing on the web preview.
 *
 * A store subscription is named before anything is deleted. Deleting the
 * account cannot stop Apple or Google from charging, only the person can, and
 * finding that out from next week's receipt would be the worst way to learn it.
 */
export function AccountPanel({ showDelete = false }: { showDelete?: boolean } = {}) {
  const { c } = useTheme();
  const router = useRouter();
  const { signOut, getToken } = useAuth();
  const push = usePush();
  const { status, renewing } = useAccess();

  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storeRenewing = renewing.filter((p): p is 'apple' | 'google' => p === 'apple' || p === 'google');

  /**
   * Where a subscription is managed or cancelled is wherever it was bought.
   * The App Store and Google Play only let people cancel in their own
   * settings, so those open there. A website subscription opens Stripe's
   * portal, signed in with this session, on its cancel step for "cancel".
   */
  const openBilling = async (flow: 'manage' | 'cancel') => {
    setError(null);
    if (!renewing.includes('stripe')) {
      manageStoreSubscription(storeRenewing[0] === 'google' ? 'google' : 'apple');
      return;
    }
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/api/stripe/portal`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(flow === 'cancel' ? { flow: 'cancel' } : {}),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (data.url) openPage(data.url);
      else setError(data.error ?? 'Could not open billing. Please try again.');
    } catch {
      setError('Could not reach CongTrade. Check your connection and try again.');
    }
  };

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
      <ProfileEditor />

      <Group>
        <ListRow
          icon="sparkles-outline"
          label="Plan"
          right={
            status === 'pro' ? (
              <Pill label="CongTrade Pro" tone="accent" />
            ) : (
              <Pill label="No active plan" tone="neutral" solid={false} />
            )
          }
        />
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
          onPress={() => void openBilling('manage')}
          last={!renewing.length}
        />
        {/* Only while something renews: there is nothing to cancel otherwise. */}
        {renewing.length ? (
          <ListRow
            icon="close-circle-outline"
            label="Cancel subscription"
            detail={
              renewing.includes('stripe')
                ? 'You keep Pro until the end of the period you paid for'
                : `In your ${storeRenewing[0] === 'google' ? 'Google Play' : 'App Store'} settings`
            }
            destructive
            onPress={() => void openBilling('cancel')}
            last
          />
        ) : null}
      </Group>

      <Group>
        <ListRow
          icon="log-out-outline"
          label="Sign out"
          chevron={false}
          onPress={() => confirmSignOut(push.signOut)}
          last
        />
      </Group>

      {/* Only from Settings > Account, where someone goes to manage the account.
          The avatar and the profile card open this page too, to look at the plan
          or sign out, and a delete link there is too easily tapped by mistake. */}
      {showDelete ? (
        <>
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
                This deletes your account, your sign-in and your saved alerts, straight away and for good. Billing
                records are kept for seven years because Dutch law requires it. Follows on this phone stay until you
                remove the app.
              </Text>

              {storeRenewing.map((store) => (
                <View key={store} style={[styles.storeWarning, { backgroundColor: c.lossSoft }]}>
                  <Text variant="caption">
                    Your {store === 'apple' ? 'App Store' : 'Google Play'} subscription will keep renewing. Deleting
                    your account does not cancel it. Cancel it first.
                  </Text>
                  <Tap onPress={() => manageStoreSubscription(store)}>
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
        </>
      ) : null}

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
  center: { textAlign: 'center' },
  bold: { fontWeight: '700' },
  underline: { textDecorationLine: 'underline' },
  // Set further down than the gap between groups, so it reads as apart from Sign out.
  deleteLink: { alignItems: 'center', paddingVertical: 6, marginTop: 16 },
  confirm: { gap: 12, padding: 18, borderRadius: radius.xl, borderWidth: 1 },
  warnIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  storeWarning: { gap: 6, padding: 12, borderRadius: radius.md },
});
