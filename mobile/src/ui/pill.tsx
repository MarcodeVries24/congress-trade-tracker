import { StyleSheet, View } from 'react-native';

import { radius, useTheme } from '@/theme';
import { Text } from '@/ui/text';

export type PillTone = 'gain' | 'loss' | 'neutral' | 'accent' | 'warn' | 'primary';

/** A small solid label: Bought, Sold, Late, Pro. */
export function Pill({ label, tone = 'neutral', solid = true }: { label: string; tone?: PillTone; solid?: boolean }) {
  const { c } = useTheme();
  const map = {
    gain: [c.gain, c.gainSoft],
    loss: [c.loss, c.lossSoft],
    accent: [c.accent, c.accentSoft],
    warn: [c.warn, c.warnSoft],
    neutral: [c.textMuted, c.surfaceMuted],
    primary: [c.primary, c.surfaceMuted],
  }[tone];
  return (
    <View style={[styles.pill, { backgroundColor: solid ? map[0] : map[1] }]}>
      <Text
        variant="footnote"
        color={solid ? (tone === 'primary' ? c.primaryText : '#FFFFFF') : map[0]}
        style={styles.text}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  text: { fontWeight: '700' },
});
