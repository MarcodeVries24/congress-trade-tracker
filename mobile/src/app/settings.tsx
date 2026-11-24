import { useAuth, useUser } from '@clerk/clerk-expo';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Switch } from 'react-native';

import { useAccess } from '@/lib/access';
import { fetchAlerts, setReminders } from '@/lib/api';
import { useFollows } from '@/lib/follows';
import { haptic } from '@/lib/haptics';
import { confirmSignOut } from '@/lib/confirm-sign-out';
import { LINKS, SITE, openPage } from '@/lib/links';
import { manageStoreSubscription } from '@/lib/manage-store-subscription';
import { usePush } from '@/lib/push';
import { useAuthedRequest } from '@/lib/use-api';
import { useTheme } from '@/theme';
import { ListRow } from '@/ui/list-row';
import { Group } from '@/ui/section';
import { Text } from '@/ui/text';

/**
 * Settings: the account, notifications, and the data this device keeps.
 *
 * Clearing rows ask twice in place (the label changes to "Tap again to
 * confirm") rather than through a dialog, so they behave the same everywhere,
 * the web preview included. Sign out asks in a dialog (confirmSignOut).
 * Delete account is not here but on the Account page, so it is never
 * mistaken for Sign out.
 */
export default function SettingsScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const push = usePush();
  const { signOut } = push;
  const { user } = useUser();
  const { status, renewing } = useAccess();
  const follows = useFollows();
  const [confirm, setConfirm] = useState<'follows' | 'onboarding' | null>(null);

  // Whether the account wants the occasional reminder that new trades were
  // published. Null until the server has said, and where it cannot arrive
  // (push off on this phone): no row then.
  const authed = useAuthedRequest();
  const [reminders, setRemindersState] = useState<boolean | null>(null);
  useEffect(() => {
    if (!push.enabled) return;
    let cancelled = false;
    void (async () => {
      try {
        const list = await fetchAlerts(await authed());
        if (!cancelled) setRemindersState(list.reminders ?? null);
      } catch {
        // The row stays away; nothing here depends on it.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [push.enabled, authed]);
  const toggleReminders = async (on: boolean) => {
    haptic.select();
    setRemindersState(on);
    try {
      await setReminders(on, await authed());
    } catch {
      setRemindersState(!on);
    }
  };
  const showReminders = push.enabled && reminders !== null;

  const store = renewing.includes('apple')
    ? 'apple'
    : renewing.includes('google')
      ? 'google'
      : Platform.OS === 'android'
        ? 'google'
        : 'apple';
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const ask = (what: 'follows' | 'onboarding', run: () => void) => {
    if (confirm === what) {
      haptic.commit();
      setConfirm(null);
      run();
    } else {
      haptic.select();
      setConfirm(what);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content}>
      <Group title="Account">
        <ListRow
          icon="person-circle-outline"
          label={isSignedIn ? 'Account' : 'Sign in'}
          detail={isSignedIn ? (user?.primaryEmailAddress?.emailAddress ?? undefined) : 'Same account as the website'}
          onPress={() => router.push({ pathname: '/sign-in', params: { manage: '1' } })}
        />
        <ListRow
          icon="card-outline"
          label="Subscription"
          detail={status === 'pro' ? 'CongTrade Pro' : 'No active plan'}
          onPress={() =>
            renewing.includes('stripe')
              ? openPage(`${SITE}/account`)
              : manageStoreSubscription(store === 'google' ? 'google' : 'apple')
          }
          last={!isSignedIn}
        />
        {isSignedIn ? (
          <ListRow
            icon="log-out-outline"
            label="Sign out"
            onPress={() => confirmSignOut(signOut)}
            chevron={false}
            last
          />
        ) : null}
      </Group>

      <Group title="Notifications">
        <ListRow
          icon="options-outline"
          label="Your alerts"
          detail="Push or email when a filing matches"
          onPress={() => router.push('/email-alerts')}
        />
        <ListRow
          icon="phone-portrait-outline"
          label="Push notifications"
          detail={
            push.unsupported
              ? 'Not available on this device'
              : push.enabled
                ? 'On for this phone'
                : push.permission === 'denied'
                  ? 'Off in Settings'
                  : 'Off for this phone'
          }
          onPress={() => router.push('/email-alerts')}
          last={!showReminders}
        />
        {showReminders ? (
          <ListRow
            icon="time-outline"
            label="New trades reminder"
            detail="When your alerts are quiet"
            right={
              <Switch
                value={reminders ?? true}
                onValueChange={(v) => void toggleReminders(v)}
                trackColor={{ true: c.gain, false: c.borderStrong }}
                thumbColor="#FFFFFF"
                accessibilityLabel="New trades reminder"
              />
            }
            last
          />
        ) : null}
      </Group>

      <Group title="On this device">
        <ListRow
          icon="star-half-outline"
          label={confirm === 'follows' ? 'Tap again to clear' : 'Clear follows'}
          detail={`${follows.members.length} ${follows.members.length === 1 ? 'politician' : 'politicians'} on your watchlist`}
          destructive={confirm === 'follows'}
          chevron={false}
          onPress={() => ask('follows', follows.clear)}
        />
        <ListRow
          icon="refresh-outline"
          label={confirm === 'onboarding' ? 'Tap again to start over' : 'Redo the setup questions'}
          destructive={confirm === 'onboarding'}
          chevron={false}
          last
          onPress={() =>
            ask('onboarding', () => {
              // The welcome screen clears the answers itself once it is open
              // (see `redo` there). Cleared here, the root layout would see
              // setup undone while this screen is still showing and open a
              // second welcome screen without `redo`, which sends a
              // subscriber straight back into the app.
              router.replace({ pathname: '/onboarding', params: { redo: '1' } });
            })
          }
        />
      </Group>

      <Group title="About">
        <ListRow icon="globe-outline" label="congtrade.com" onPress={() => openPage(SITE)} />
        <ListRow
          icon="information-circle-outline"
          label="About CongTrade"
          onPress={() => openPage(LINKS.about)}
          last={Boolean(isSignedIn)}
        />
        {/* Signed in, deleting is one level down, on the Account page
            (AccountPanel), away from Sign out. Signed out there is nothing
            on this phone to delete, only the website's instructions. */}
        {isSignedIn ? null : (
          <ListRow
            icon="trash-outline"
            label="How to delete an account"
            onPress={() => openPage(LINKS.deleteAccount)}
            last
          />
        )}
      </Group>

      <Text variant="footnote" tone="faint" style={styles.version}>
        Version {version}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 24, paddingBottom: 48 },
  version: { textAlign: 'center' },
});
