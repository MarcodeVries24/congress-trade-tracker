import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';
import { Text } from '@/ui/text';

// Deep, saturated tones that all carry white text. Picked from the ticker by
// a hash, so a company always wears the same colour everywhere in the app.
const TONES = [
  '#101729',
  '#1D4ED8',
  '#0F766E',
  '#7C3AED',
  '#BE123C',
  '#B45309',
  '#15803D',
  '#334155',
  '#9D174D',
  '#3A82C2',
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/**
 * A company's mark. Not its real logo: those are trademarks, and a service
 * that fetches them would be one more thing to license. A coloured tile with
 * the ticker is instantly readable and entirely ours.
 */
export function TickerLogo({ ticker, size = 44 }: { ticker: string | null; size?: number }) {
  const { scheme } = useTheme();
  const label =
    (ticker ?? '?')
      .replace(/[^A-Z0-9.]/gi, '')
      .slice(0, 4)
      .toUpperCase() || '?';
  const bg = TONES[hash(label) % TONES.length];
  const fontSize = label.length <= 2 ? size * 0.38 : label.length === 3 ? size * 0.3 : size * 0.25;
  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: size * 0.3, backgroundColor: bg },
        // The navy and slate tones sink into a dark card without an edge.
        scheme === 'dark' ? styles.edge : null,
      ]}>
      <Text variant="bodyStrong" color="#FFFFFF" style={{ fontSize, lineHeight: fontSize * 1.2, fontWeight: '800' }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: { alignItems: 'center', justifyContent: 'center' },
  edge: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)' },
});
