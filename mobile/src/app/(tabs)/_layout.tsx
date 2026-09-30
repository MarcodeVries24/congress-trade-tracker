import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptic } from '@/lib/haptics';
import { useSeedFollowsFromOnboarding } from '@/lib/seed-follows';
import { useTheme } from '@/theme';
import { Icon, type IconName } from '@/ui/icon';

const TABS: { name: string; title: string; icon: IconName; active: IconName }[] = [
  { name: 'index', title: 'Discover', icon: 'flame-outline', active: 'flame' },
  { name: 'trades', title: 'Trades', icon: 'swap-vertical-outline', active: 'swap-vertical' },
  { name: 'politicians', title: 'Politicians', icon: 'people-outline', active: 'people' },
  { name: 'alerts', title: 'Alerts', icon: 'notifications-outline', active: 'notifications' },
  { name: 'more', title: 'More', icon: 'person-outline', active: 'person' },
];

/**
 * Five tabs: Discover is where you find things, Trades is every trade with
 * every filter, Politicians is everyone who files with your Watchlist beside
 * them, Alerts is what the people you follow did, More is you.
 *
 * A JavaScript tab bar rather than the native one, so the red active state,
 * the filled icons and the spacing are identical on iOS and Android.
 */
export default function TabLayout() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  useSeedFollowsFromOnboarding();
  return (
    <Tabs
      screenListeners={{ tabPress: () => haptic.select() }}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textMuted,
        tabBarLabelStyle: styles.label,
        tabBarStyle: {
          backgroundColor: c.tabBar,
          borderTopColor: c.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 58 + insets.bottom,
          paddingTop: 6,
        },
        sceneStyle: { backgroundColor: c.background },
      }}>
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarIcon: ({ focused, color }) => (
              <Icon name={focused ? t.active : t.icon} size={24} color={String(color)} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 11, fontWeight: '600', marginTop: 2 },
});
