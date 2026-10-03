import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

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

/**
 * The Capitol dome from the website's header (web/components/Logo.tsx), in
 * the page's ink, with the base in brand blue as on the app icon.
 */
export function LogoMark({ size = 24 }: { size?: number }) {
  const { scheme, c } = useTheme();
  const ink = scheme === 'dark' ? c.text : brand.ink;
  const base = scheme === 'dark' ? c.accent : brand.blue;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="2.6" r="0.9" fill={ink} />
      <Line x1="12" y1="3.6" x2="12" y2="6.4" stroke={ink} strokeWidth="1.3" strokeLinecap="round" />
      <Path d="M6.3 13.8C6.3 9.2 8.7 5.4 12 5.4C15.3 5.4 17.7 9.2 17.7 13.8" stroke={ink} strokeWidth="1.4" strokeLinecap="round" />
      <Path d="M8 11.6C9.1 10.8 10.5 10.3 12 10.3C13.5 10.3 14.9 10.8 16 11.6" stroke={ink} strokeWidth="1.1" strokeLinecap="round" />
      <Rect x="9" y="13.6" width="6" height="2.6" rx="0.3" fill={ink} />
      <Path d="M4.4 17.8L12 14.2L19.6 17.8Z" fill={ink} />
      {[3.2, 6.1, 9, 11.9, 14.8, 17.7].map((x) => (
        <Rect key={x} x={x} y="17.8" width="1.5" height="3.6" fill={ink} />
      ))}
      <Rect x="2" y="21.4" width="20" height="1.7" rx="0.4" fill={base} />
    </Svg>
  );
}

/** Mark and wordmark side by side, as the website's header has them. */
export function Brand({ size = 22 }: { size?: number }) {
  return (
    <View style={styles.brand}>
      <LogoMark size={size * 1.15} />
      <Logo size={size} />
    </View>
  );
}

const styles = StyleSheet.create({
  word: { fontWeight: '800', letterSpacing: -0.6 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
