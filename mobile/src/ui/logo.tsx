import { StyleSheet, Text } from 'react-native';

import { brand, useTheme } from '@/theme';

/**
 * The wordmark: "Cong" in ink, "Trade" in the brand blue, as in the logo.
 * On a dark page the ink half turns light so the word stays whole.
 */
export function Logo({ size = 22 }: { size?: number }) {
  const { scheme, c } = useTheme();
  return (
    <Text
      style={[styles.word, { fontSize: size, lineHeight: size * 1.2 }]}
      accessibilityRole="header"
      accessibilityLabel="CongTrade">
      <Text style={{ color: scheme === 'dark' ? c.text : brand.ink }}>Cong</Text>
      <Text style={{ color: scheme === 'dark' ? c.accent : brand.blue }}>Trade</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  word: { fontWeight: '800', letterSpacing: -0.6 },
});
