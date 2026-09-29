import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme';
import { Text } from '@/ui/text';

/** The flag and the wordmark, as in the header of every tab. */
export function Logo({ size = 22 }: { size?: number }) {
  const { c } = useTheme();
  return (
    <View style={styles.row}>
      <Image
        source={require('@/assets/images/flag.png')}
        style={{ width: size * 1.35, height: size }}
        contentFit="contain"
      />
      <Text style={[styles.word, { fontSize: size * 0.95, lineHeight: size * 1.15, color: c.primary }]}>CongTrade</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  word: { fontWeight: '800', letterSpacing: -0.4 },
});
