import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

/**
 * Five tabs, in the order someone actually moves through them.
 *
 * Trades is home because the feed is the product. Alerts gets a tab of its own
 * rather than living in a settings screen: on the website it is a paid feature
 * you go and find, on a phone it is the reason the app stays installed.
 *
 * SF Symbols on iOS, which is why no icon assets are shipped. Android needs
 * drawable resources for the same triggers and does not have them yet, so its
 * tab bar is labels only for now.
 */
export default function TabLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Trades</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.line.uptrend.xyaxis" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="politicians">
        <NativeTabs.Trigger.Label>Politicians</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.2" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="issuers">
        <NativeTabs.Trigger.Label>Issuers</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="building.2" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="alerts">
        <NativeTabs.Trigger.Label>Alerts</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="bell" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="news">
        <NativeTabs.Trigger.Label>News</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="newspaper" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
