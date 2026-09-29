import { useAuth, useUser } from '@clerk/clerk-expo';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useAccess } from '@/lib/access';
import { useFollows } from '@/lib/follows';
import { LINKS, openPage } from '@/lib/links';
import { radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/avatar';
import { Button } from '@/ui/button';
import { Icon } from '@/ui/icon';
import { ListRow } from '@/ui/list-row';
import { Pill } from '@/ui/pill';
import { Group } from '@/ui/section';
import { TabHeader } from '@/ui/tab-header';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

/**
 * More: you, and everything that is not a feed.
 *
 * The profile card at the top opens the account (plan, sign out, delete). The
 * rest is grouped the way settings screens are: your things, the directories,
 * then help and the legal pages.
 */
export default function MoreScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const { isSignedIn, signOut } = useAuth();
  const { user } = useUser();
  const { status } = useAccess();
  const follows = useFollows();

  const name = user?.fullName || user?.primaryEmailAddress?.emailAddress || 'Guest';
  const plan = status === 'pro' ? 'CongTrade Pro' : isSignedIn ? 'Free plan' : 'Not signed in';
  const version = Constants.expoConfig?.version ?? '1.0.0';

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}>
      <TabHeader />

      <View style={styles.inset}>
        <Tap
          feedback="tap"
          scaleTo={0.98}
          onPress={() => router.push('/sign-in')}
          style={[styles.profile, { backgroundColor: c.surface, borderColor: c.border }]}>
          {isSignedIn ? (
            <Avatar uri={user?.imageUrl} name={name} size={64} />
          ) : (
            <View style={[styles.guest, { backgroundColor: c.surfaceMuted }]}>
              <Icon name="person" size={30} color={c.textMuted} />
            </View>
          )}
          <View style={styles.profileText}>
            <Text variant="headline" numberOfLines={1}>
              {isSignedIn ? name : 'Sign in'}
            </Text>
            <View style={styles.planRow}>
              {status === 'pro' ? <Pill label="PRO" tone="accent" /> : null}
              <Text variant="caption" tone="muted">
                {isSignedIn ? plan : 'Same account as the website'}
              </Text>
            </View>
          </View>
          <Icon name="chevron-forward" size={20} color={c.textFaint} />
        </Tap>

        <Group>
          <ListRow
            icon="trending-up-outline"
            label="My Portfolio"
            detail={`${follows.stocks.length} ${follows.stocks.length === 1 ? 'stock' : 'stocks'}`}
            onPress={() => router.push({ pathname: '/portfolio', params: { view: 'holdings' } })}
          />
          <ListRow
            icon="star-outline"
            label="Watchlist"
            detail={`${follows.members.length} ${follows.members.length === 1 ? 'member' : 'members'}`}
            onPress={() => router.push({ pathname: '/portfolio', params: { view: 'watchlist' } })}
          />
          <ListRow
            icon="notifications-outline"
            label="Email alerts"
            onPress={() => router.push('/email-alerts')}
            last
          />
        </Group>

        <Group title="Browse">
          <ListRow icon="people-outline" label="Politicians" onPress={() => router.push('/politicians')} />
          <ListRow icon="business-outline" label="Companies" onPress={() => router.push('/issuers')} />
          <ListRow icon="newspaper-outline" label="News" onPress={() => router.push('/news')} />
          <ListRow icon="albums-outline" label="Swipe through Congress" onPress={() => router.push('/swipe')} last />
        </Group>

        <Group>
          <ListRow icon="settings-outline" label="Settings" onPress={() => router.push('/settings')} />
          <ListRow icon="help-circle-outline" label="Help & Support" onPress={() => router.push('/help')} last />
        </Group>

        <Group title="Legal">
          <ListRow icon="shield-checkmark-outline" label="Privacy Policy" onPress={() => openPage(LINKS.privacy)} />
          <ListRow icon="document-text-outline" label="Terms of Service" onPress={() => openPage(LINKS.terms)} />
          <ListRow
            icon="information-circle-outline"
            label="Disclaimer"
            onPress={() => openPage(LINKS.disclaimer)}
            last
          />
        </Group>

        {isSignedIn ? (
          <Button label="Log Out" icon="log-out-outline" kind="secondary" onPress={() => void signOut()} />
        ) : (
          <Button label="Sign in" icon="log-in-outline" onPress={() => router.push('/sign-in')} />
        )}

        <View style={[styles.footer, { borderColor: c.border }]}>
          <Text variant="footnote" tone="faint" style={styles.center}>
            CongTrade {version} · a service of MV Digital
          </Text>
          <Text variant="footnote" tone="faint" style={styles.center}>
            Data from the House Clerk and the Senate eFD system. Not investment advice.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: 40 },
  inset: { paddingHorizontal: 16, paddingTop: 10, gap: 22 },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 18,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  guest: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  profileText: { flex: 1, gap: 4 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footer: { gap: 4, paddingTop: 4 },
  center: { textAlign: 'center' },
});
