import { useAuth, useUser } from '@clerk/clerk-expo';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, ScrollView, StyleSheet } from 'react-native';

import { useAccess } from '@/lib/access';
import { useFollows } from '@/lib/follows';
import { haptic } from '@/lib/haptics';
import { LINKS, SITE, openPage } from '@/lib/links';
import { useOnboarding } from '@/lib/onboarding';
import { useTheme } from '@/theme';
import { ListRow } from '@/ui/list-row';
import { Group } from '@/ui/section';
import { Text } from '@/ui/text';

/**
 * Settings: the account, notifications, and the data this device keeps.
 *
 * Destructive rows ask twice in place (the label changes to "Tap again to
 * confirm") rather than through a dialog, so they behave the same everywhere,
 * the web preview included.
 */
export default function SettingsScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const { isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const { status, renewing } = useAccess();
  const follows = useFollows();
  const { reset } = useOnboarding();
  const [confirm, setConfirm] = useState<'follows' | 'onboarding' | null>(null);

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
          onPress={() => router.push('/sign-in')}
        />
        <ListRow
          icon="card-outline"
          label="Subscription"
          detail={status === 'pro' ? 'CongTrade Pro' : 'No active plan'}
          onPress={() =>
            renewing.includes('stripe')
              ? openPage(`${SITE}/account`)
              : openPage(store === 'google' ? LINKS.manageGoogle : LINKS.manageApple)
          }
        />
        {isSignedIn ? (
          <>
            <ListRow icon="log-out-outline" label="Sign out" onPress={() => void signOut()} chevron={false} />
            <ListRow
              icon="trash-outline"
              label="Delete account"
              destructive
              onPress={() => router.push('/sign-in')}
              last
            />
          </>
        ) : (
          <ListRow
            icon="trash-outline"
            label="How to delete an account"
            onPress={() => openPage(LINKS.deleteAccount)}
            last
          />
        )}
      </Group>

      <Group title="Notifications">
        <ListRow
          icon="mail-outline"
          label="Email alerts"
          detail="Emailed when a filing matches"
          onPress={() => router.push('/email-alerts')}
        />
        <ListRow
          icon="phone-portrait-outline"
          label="Push notifications"
          detail="Coming soon. Email alerts work today."
          last
          chevron={false}
        />
      </Group>

      <Group title="On this device">
        <ListRow
          icon="star-half-outline"
          label={confirm === 'follows' ? 'Tap again to clear' : 'Clear follows'}
          detail={`${follows.members.length} members and ${follows.stocks.length} stocks`}
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
              void reset().then(() => router.replace('/onboarding'));
            })
          }
        />
      </Group>

      <Group title="About">
        <ListRow icon="globe-outline" label="congtrade.com" onPress={() => openPage(SITE)} />
        <ListRow icon="information-circle-outline" label="About CongTrade" onPress={() => openPage(LINKS.about)} last />
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
