import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';

import { useTheme } from '@/theme';
import { Text } from '@/ui/text';

/**
 * A publisher's picture, or its name on a tint when there is none or it will
 * not load, so a card is never a grey hole. (CNBC's image server turns away
 * some clients by user agent; a phone's own is not one of them.)
 */
export function NewsImage({
  uri,
  source,
  style,
}: {
  uri: string | null;
  source: string;
  style: StyleProp<ImageStyle>;
}) {
  const { c } = useTheme();
  const [failed, setFailed] = useState(false);
  if (!uri || failed) {
    return (
      <View style={[style, styles.fallback, { backgroundColor: c.surfaceMuted }]}>
        <Text variant="label" tone="muted" style={styles.fallbackLabel}>
          {source.toUpperCase()}
        </Text>
      </View>
    );
  }
  return <Image source={{ uri }} style={style} contentFit="cover" transition={200} onError={() => setFailed(true)} />;
}

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackLabel: { letterSpacing: 2 },
});
