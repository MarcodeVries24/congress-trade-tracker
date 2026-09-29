import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, SectionList, StyleSheet, View } from 'react-native';

import { fetchNews, fetchPolicy, type NewsItem, type NewsSection } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { openPage } from '@/lib/links';
import { radius, useTheme } from '@/theme';
import { EmptyState } from '@/ui/empty-state';
import { Icon } from '@/ui/icon';
import { RowSkeleton } from '@/ui/skeleton';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

/**
 * A publisher's picture, or its name on a tint when there is none or it will
 * not load. CNBC's image server refuses clients that are not desktop browsers,
 * so failing is expected rather than rare, and the tile is never a grey hole.
 */
function NewsImage({
  uri,
  source,
  style,
  hideOnFail,
}: {
  uri: string | null;
  source: string;
  style: object;
  hideOnFail?: boolean;
}) {
  const { c } = useTheme();
  const [failed, setFailed] = useState(false);
  if (!uri || failed) {
    if (hideOnFail) return null;
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

/**
 * News: official announcements first, then the market press by publisher.
 *
 * Headlines open in the in-app browser; the story is the publisher's, and the
 * app only points at it.
 */
export default function NewsScreen() {
  const { c } = useTheme();
  const [sections, setSections] = useState<NewsSection[] | null>(null);
  const [policy, setPolicy] = useState<NewsItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const [news, official] = await Promise.all([fetchNews(), fetchPolicy().catch(() => [])]);
      setSections(news);
      setPolicy(official);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Every state update in load is behind an await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  if (!sections) {
    return (
      <View style={[styles.screen, { backgroundColor: c.background }]}>
        {error ? (
          <EmptyState
            icon="cloud-offline-outline"
            title="Couldn't load the news"
            body={error}
            action="Try again"
            onAction={() => void load()}
          />
        ) : (
          <RowSkeleton count={7} />
        )}
      </View>
    );
  }

  const header = policy.length ? (
    <View style={styles.policy}>
      <Text variant="headline" style={styles.pad}>
        From Washington
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.policyRow}>
        {policy.slice(0, 8).map((p) => (
          <Tap
            key={p.url}
            feedback="tap"
            scaleTo={0.97}
            onPress={() => openPage(p.url)}
            style={[styles.policyCard, { backgroundColor: c.surface, borderColor: c.border }]}>
            <View style={styles.policyHead}>
              <View style={[styles.policyIcon, { backgroundColor: c.surfaceMuted }]}>
                <Icon name="business" size={16} color={c.primary} />
              </View>
              <Text variant="footnote" style={styles.bold} numberOfLines={1}>
                {p.source}
              </Text>
            </View>
            <Text variant="callout" style={styles.bold} numberOfLines={4}>
              {p.title}
            </Text>
            <Text variant="footnote" tone="faint">
              {timeAgo(p.publishedAt)}
            </Text>
          </Tap>
        ))}
      </ScrollView>
    </View>
  ) : null;

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <SectionList
        sections={sections.map((s) => ({ ...s, data: s.items }))}
        keyExtractor={(item) => item.url}
        renderItem={({ item, index }) =>
          index === 0 ? (
            <Tap
              feedback="tap"
              scaleTo={0.98}
              onPress={() => openPage(item.url)}
              style={[styles.lead, { backgroundColor: c.surface, borderColor: c.border }]}>
              <NewsImage uri={item.image} source={item.source} style={styles.leadImage} />
              <View style={styles.leadText}>
                <Text variant="subhead" numberOfLines={3}>
                  {item.title}
                </Text>
                <Text variant="footnote" tone="faint">
                  {item.source} · {timeAgo(item.publishedAt)}
                </Text>
              </View>
            </Tap>
          ) : (
            <Tap
              scaleTo={0.985}
              onPress={() => openPage(item.url)}
              style={[styles.item, { borderBottomColor: c.border }]}>
              <View style={styles.itemText}>
                <Text variant="bodyStrong" numberOfLines={3}>
                  {item.title}
                </Text>
                <Text variant="footnote" tone="faint">
                  {timeAgo(item.publishedAt)}
                </Text>
              </View>
              <NewsImage uri={item.image} source={item.source} style={styles.thumb} hideOnFail />
            </Tap>
          )
        }
        renderSectionHeader={({ section }) => (
          <Tap
            onPress={() => openPage(section.homepage)}
            style={[styles.sectionHead, { backgroundColor: c.background }]}>
            <Text variant="headline">{section.publisher}</Text>
            <Text variant="caption" tone="muted">
              {section.blurb}
            </Text>
          </Tap>
        )}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={header}
        ListEmptyComponent={<EmptyState icon="newspaper-outline" title="No news right now" compact />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load();
            }}
            tintColor={c.textMuted}
          />
        }
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingBottom: 40 },
  pad: { paddingHorizontal: 20 },
  bold: { fontWeight: '700' },
  policy: { gap: 12, paddingTop: 8 },
  policyRow: { paddingHorizontal: 16, gap: 10 },
  policyCard: { width: 230, padding: 14, gap: 8, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth },
  policyHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  policyIcon: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  sectionHead: { paddingHorizontal: 20, paddingTop: 26, paddingBottom: 12, gap: 2 },
  lead: {
    marginHorizontal: 16,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 4,
  },
  leadImage: { width: '100%', aspectRatio: 16 / 9 },
  leadText: { padding: 14, gap: 6 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemText: { flex: 1, gap: 4 },
  thumb: { width: 76, height: 76, borderRadius: radius.md },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackLabel: { letterSpacing: 2 },
});
