import { StyleSheet, View } from 'react-native';

import { radius, useTheme } from '@/theme';
import { Icon } from '@/ui/icon';
import { Text } from '@/ui/text';

/** The one wording, so every screen says the same thing. */
export const NOT_ADVICE_SHORT = 'For information only. Not financial advice.';
export const NOT_ADVICE_LONG =
  "CongTrade shows what members of Congress disclosed and what prices did around those disclosures. It is for information only and is not financial, investment or trading advice, or a recommendation to buy or sell anything. A well-timed trade is not evidence of wrongdoing, and past price moves say nothing about future ones.";

/**
 * "Not financial advice", wherever the app shows prices or rankings built
 * on them. `banner` is the boxed form for the top of a screen given over to
 * them; the default is a line under a card.
 */
export function NotAdvice({ banner = false, long = false }: { banner?: boolean; long?: boolean }) {
  const { c } = useTheme();
  const text = long ? NOT_ADVICE_LONG : NOT_ADVICE_SHORT;
  if (!banner) {
    return (
      <View style={styles.line}>
        <Icon name="information-circle-outline" size={14} color={c.textFaint} />
        <Text variant="footnote" tone="faint" style={styles.flex}>
          {text}
        </Text>
      </View>
    );
  }
  return (
    <View style={[styles.banner, { backgroundColor: c.surfaceMuted, borderColor: c.border }]}>
      <Icon name="information-circle" size={18} color={c.textMuted} />
      <Text variant="caption" tone="muted" style={styles.flex}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
