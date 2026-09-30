import { useState } from 'react';
import { LayoutAnimation, Platform, ScrollView, StyleSheet, UIManager, View } from 'react-native';

import { haptic } from '@/lib/haptics';
import { LINKS, SUPPORT_EMAIL, emailSupport, openPage } from '@/lib/links';
import { radius, useTheme } from '@/theme';
import { Button } from '@/ui/button';
import { Icon } from '@/ui/icon';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const FAQ: { q: string; a: string }[] = [
  {
    q: 'Where does the data come from?',
    a: 'From the Periodic Transaction Reports members of Congress are required to file. We read them from the House Clerk and the Senate’s electronic disclosure system, and every trade links to the filing it came from.',
  },
  {
    q: 'How quickly do new trades appear?',
    a: 'We check both disclosure sites every few hours, so a filing shows up soon after it is published. Members have up to 45 days after they are notified of a trade to report it, so the trade itself can be several weeks old by then. Each trade shows both dates.',
  },
  {
    q: 'Why are amounts shown as ranges?',
    a: 'The law only asks members to report a value bracket, such as $1,001 – $15,000, not the exact amount. Volumes in the app are estimates based on the middle of each bracket.',
  },
  {
    q: 'Why do some filters need Pro?',
    a: 'Searching and choosing a chamber work for everyone. The rest (members, tickers, party, amounts, dates and so on) are part of CongTrade Pro, and the Trades tab says so when they are not being applied.',
  },
  {
    q: 'How do alerts work?',
    a: 'The Alerts tab shows every recent trade by the politicians on your watchlist. Email alerts go further: they email you as soon as a new filing matches the criteria you set. Push notifications are on the way.',
  },
  {
    q: 'How do I cancel my subscription?',
    a: 'A subscription bought in the app is managed by Apple or Google. On iPhone: Settings, your name, Subscriptions. On Android: the Play Store, Payments & subscriptions. A subscription bought on the website is cancelled from your account page there.',
  },
  {
    q: 'Is this investment advice?',
    a: 'No. CongTrade reports what members of Congress disclosed. It does not recommend buying or selling anything.',
  },
];

/** Help & Support: answers first, then a way to reach a person. */
export default function HelpScreen() {
  const { c } = useTheme();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content}>
      <Text variant="title">How can we help?</Text>
      <View style={[styles.card, { backgroundColor: c.surface, borderColor: c.border }]}>
        {FAQ.map((item, i) => {
          const expanded = open === i;
          return (
            <Tap
              key={item.q}
              scaleTo={0.99}
              onPress={() => {
                haptic.select();
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                setOpen(expanded ? null : i);
              }}
              style={[
                styles.item,
                i < FAQ.length - 1 && { borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth },
              ]}>
              <View style={styles.question}>
                <Text variant="bodyStrong" style={styles.flex}>
                  {item.q}
                </Text>
                <Icon name={expanded ? 'remove' : 'add'} size={20} color={c.textMuted} />
              </View>
              {expanded ? (
                <Text variant="callout" tone="muted" style={styles.answer}>
                  {item.a}
                </Text>
              ) : null}
            </Tap>
          );
        })}
      </View>

      <View style={[styles.contact, { backgroundColor: c.surface, borderColor: c.border }]}>
        <Icon name="chatbubbles-outline" size={28} color={c.primary} />
        <Text variant="subhead">Still stuck?</Text>
        <Text variant="callout" tone="muted" style={styles.centerText}>
          Email {SUPPORT_EMAIL}. We read every message and reply as soon as we can.
        </Text>
        <Button
          label="Email support"
          icon="mail-outline"
          onPress={() => emailSupport('CongTrade app')}
          style={styles.full}
        />
        <Button
          label="Report a data error"
          kind="secondary"
          onPress={() => emailSupport('Data error in CongTrade')}
          style={styles.full}
        />
      </View>

      <Tap onPress={() => openPage(LINKS.deleteAccount)} style={styles.link}>
        <Text variant="caption" tone="muted" style={styles.underline}>
          How account deletion works
        </Text>
      </Tap>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 18, paddingBottom: 48 },
  card: { borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  item: { paddingHorizontal: 18, paddingVertical: 16, gap: 10 },
  question: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  answer: { lineHeight: 21 },
  contact: {
    alignItems: 'center',
    gap: 8,
    padding: 22,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  centerText: { textAlign: 'center' },
  full: { alignSelf: 'stretch', marginTop: 6 },
  link: { alignItems: 'center', paddingVertical: 6 },
  underline: { textDecorationLine: 'underline' },
});
