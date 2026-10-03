import { StyleSheet, View } from 'react-native';

import type { NewsItem } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { openPage } from '@/lib/links';
import { radius, useTheme } from '@/theme';
import { NewsImage } from '@/ui/news-image';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

/**
 * A headline as a picture card, for a row that scrolls sideways (Discover's
 * news), like the website's news row. Opens the publisher's page.
 */
export function NewsCard({ item, width = 248 }: { item: NewsItem; width?: number }) {
  const { c } = useTheme();
  return (
    <Tap
      feedback="tap"
      scaleTo={0.97}
      onPress={() => openPage(item.url)}
      style={[styles.card, { width, backgroundColor: c.surface, borderColor: c.border }]}>
      <NewsImage uri={item.image} source={item.source} style={styles.image} />
      <View style={styles.text}>
        <Text variant="label" tone="accent">
          {item.source.toUpperCase()}
        </Text>
        <Text variant="callout" style={styles.title} numberOfLines={3}>
          {item.title}
        </Text>
        <Text variant="footnote" tone="faint">
          {timeAgo(item.publishedAt)}
        </Text>
      </View>
    </Tap>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  image: { width: '100%', aspectRatio: 16 / 9 },
  text: { padding: 12, gap: 4, flex: 1 },
  title: { fontWeight: '700' },
});
