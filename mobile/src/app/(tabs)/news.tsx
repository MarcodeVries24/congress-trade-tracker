import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, RefreshControl, SectionList, StyleSheet, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ListState } from '@/components/list-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { fetchNews, type NewsItem, type NewsSection } from '@/lib/api';
import { timeAgo } from '@/lib/format';

/**
 * A publisher's picture, or its name on a tint when there is none or it will
 * not load, which is what the website's news cards do too.
 *
 * Failing is expected rather than rare: CNBC's image server refuses clients
 * that do not look like a desktop browser, and a phone's image loader does not.
 * Pretending to be one would work until they noticed. The name tile is honest
 * and never a grey hole.
 */
function NewsImage({
  uri,
  source,
  style,
  hideOnFail = false,
}: {
  uri: string | null;
  source: string;
  style: object;
  /** For a thumbnail, where a name tile would be clutter rather than a fallback. */
  hideOnFail?: boolean;
}) {
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const [failed, setFailed] = useState(false);
  if (!uri || failed) {
    if (hideOnFail) return null;
    return (
      <View style={[style, styles.fallback, { backgroundColor: colors.backgroundSelected }]}>
        <ThemedText style={[styles.fallbackLabel, { color: colors.textSecondary }]}>{source}</ThemedText>
      </View>
    );
  }
  return <Image source={{ uri }} style={style} contentFit="cover" transition={150} onError={() => setFailed(true)} />;
}

/**
 * Market and policy news, one section per publisher, as on the website.
 *
 * Headlines open in an in-app browser rather than being reproduced here: the
 * story belongs to the publisher, and the app is only pointing at it.
 */
export default function NewsScreen() {
  const colors = Colors[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();

  const [sections, setSections] = useState<NewsSection[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setSections(await fetchNews());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Every state update in load is behind an await, as in the trades screen.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const open = (url: string) => {
    if (Platform.OS === 'web') window.open(url, '_blank', 'noopener');
    else void WebBrowser.openBrowserAsync(url);
  };

  const renderItem = ({ item, index }: { item: NewsItem; index: number }) => {
    // The first story of each publisher leads with a picture, or with the
    // publisher's name where it has none.
    const lead = index === 0;
    return (
      <Pressable
        onPress={() => open(item.url)}
        style={({ pressed }) => [
          lead ? styles.lead : styles.item,
          { backgroundColor: colors.backgroundElement, opacity: pressed ? 0.7 : 1 },
        ]}>
        {lead ? <NewsImage uri={item.image} source={item.source} style={styles.leadImage} /> : null}
        <View style={lead ? styles.leadText : styles.itemRow}>
          <View style={styles.itemText}>
            <ThemedText numberOfLines={3} style={lead ? styles.leadTitle : styles.title}>
              {item.title}
            </ThemedText>
            <ThemedText style={[styles.meta, { color: colors.textSecondary }]}>{timeAgo(item.publishedAt)}</ThemedText>
          </View>
          {!lead && item.image ? (
            <NewsImage uri={item.image} source={item.source} style={styles.thumb} hideOnFail />
          ) : null}
        </View>
      </Pressable>
    );
  };

  if (!sections) {
    return (
      <ThemedView style={styles.screen}>
        {error ? (
          <ListState
            kind="error"
            title="Couldn't load the news"
            body={error}
            onRetry={() => {
              setError(null);
              void load();
            }}
          />
        ) : (
          <ListState kind="loading" />
        )}
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.screen}>
      <SectionList
        sections={sections.map((s) => ({ ...s, data: s.items }))}
        keyExtractor={(item) => item.url}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => (
          <Pressable onPress={() => open(section.homepage)} style={styles.sectionHeader}>
            <ThemedText style={styles.publisher}>{section.publisher}</ThemedText>
            <ThemedText style={[styles.meta, { color: colors.textSecondary }]}>{section.blurb}</ThemedText>
          </Pressable>
        )}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
          />
        }
        contentContainerStyle={[styles.list, { paddingTop: Platform.OS === 'web' ? 60 : insets.top + 8 }]}
        ListEmptyComponent={<ListState kind="empty" title="No news right now" />}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingBottom: 32, paddingHorizontal: 16 },
  sectionHeader: { paddingTop: 18, paddingBottom: 10, gap: 2 },
  publisher: { fontSize: 20, fontWeight: '800' },
  lead: { borderRadius: 14, overflow: 'hidden', marginBottom: 8 },
  leadImage: { width: '100%', aspectRatio: 16 / 9 },
  leadText: { padding: 12 },
  leadTitle: { fontSize: 17, fontWeight: '700', lineHeight: 23 },
  item: { borderRadius: 14, marginBottom: 8, padding: 12 },
  itemRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  itemText: { flex: 1, gap: 4 },
  title: { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  meta: { fontSize: 12, lineHeight: 16 },
  thumb: { width: 72, height: 72, borderRadius: 10 },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' },
});
