import { Image } from 'expo-image';
import { useCallback, useEffect, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';

import { fetchNews, fetchPolicy, type NewsItem, type NewsSection } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { openPage } from '@/lib/links';
import { MAX_CONTENT_WIDTH, radius, useTheme } from '@/theme';
import { EmptyState } from '@/ui/empty-state';
import { Icon } from '@/ui/icon';
import { RowSkeleton } from '@/ui/skeleton';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';

/**
 * A publisher's picture, or its name on a tint when there is none or it will
 * not load, so a card is never a grey hole. (CNBC's image server turns away
 * some clients by user agent; a phone's own is not one of them.)
 */
function NewsImage({
  uri,
  source,
  style,
}: {
  uri: string | null;
  source: string;
  style: object;
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

/**
 * News, laid out like the website's news page: the markets desk first, the
 * agencies' own releases, then the economy desk. Each desk leads with one
 * large picture story and the rest as a two-column grid of picture cards.
 *
 * Headlines open in the in-app browser; the story is the publisher's, and the
 * app only points at it.
 */
export default function NewsScreen() {
  const { c } = useTheme();
  // The app's column, not the window: on an iPad the two differ.
  const width = Math.min(useWindowDimensions().width, MAX_CONTENT_WIDTH);
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

  // Markets first, as on the website: it is the half people come back for.
  const ordered = [...sections].sort((a, b) => Number(b.key === 'cnbc-markets') - Number(a.key === 'cnbc-markets'));
  // Three across on a tablet's wider column, two on a phone.
  const columns = width >= 600 ? 3 : 2;
  const cardWidth = (width - 16 * 2 - GRID_GAP * (columns - 1)) / columns;
  const leadAspect = width >= 600 ? 2 : 4 / 3;

  const agencies = policy.length ? (
    <View style={styles.policy}>
      <View style={styles.groupHead}>
        <Text variant="headline">From Washington</Text>
        <Text variant="caption" tone="muted">
          Official releases, unedited
        </Text>
      </View>
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

  const desk = (section: NewsSection) => {
    const [lead, ...rest] = section.items;
    if (!lead) return null;
    return (
      <View key={section.key} style={styles.group}>
        <Tap onPress={() => openPage(section.homepage)} style={styles.groupHead}>
          <Text variant="headline">
            {section.publisher} · {section.blurb}
          </Text>
          <Text variant="caption" tone="muted">
            Published by {section.publisher}
          </Text>
        </Tap>

        <Tap
          feedback="tap"
          scaleTo={0.98}
          onPress={() => openPage(lead.url)}
          style={[styles.lead, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View>
            <NewsImage uri={lead.image} source={lead.source} style={[styles.leadImage, { aspectRatio: leadAspect }]} />
            <LinearGradient
              colors={['transparent', 'rgba(8,12,22,0.86)']}
              style={styles.leadShade}
              pointerEvents="none"
            />
            <View style={styles.leadText}>
              <Text variant="label" color="#FFFFFF" style={styles.leadSource}>
                {lead.source.toUpperCase()} · {timeAgo(lead.publishedAt)}
              </Text>
              <Text variant="headline" color="#FFFFFF" numberOfLines={3}>
                {lead.title}
              </Text>
            </View>
          </View>
        </Tap>

        <View style={styles.grid}>
          {rest.map((item) => (
            <Tap
              key={item.url}
              feedback="tap"
              scaleTo={0.97}
              onPress={() => openPage(item.url)}
              style={[styles.card, { width: cardWidth, backgroundColor: c.surface, borderColor: c.border }]}>
              <NewsImage uri={item.image} source={item.source} style={styles.cardImage} />
              <View style={styles.cardText}>
                <Text variant="callout" style={styles.bold} numberOfLines={4}>
                  {item.title}
                </Text>
                <Text variant="footnote" tone="faint">
                  {timeAgo(item.publishedAt)}
                </Text>
              </View>
            </Tap>
          ))}
        </View>
      </View>
    );
  };

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: c.background }]}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
          tintColor={c.textMuted}
        />
      }>
      {ordered.length === 0 && !policy.length ? (
        <EmptyState icon="newspaper-outline" title="No news right now" compact />
      ) : null}
      {ordered[0] ? desk(ordered[0]) : null}
      {agencies}
      {ordered.slice(1).map(desk)}
    </ScrollView>
  );
}

const GRID_GAP = 12;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingBottom: 40 },
  bold: { fontWeight: '700' },
  group: { gap: 12, paddingTop: 22 },
  groupHead: { paddingHorizontal: 16, gap: 2 },
  policy: { gap: 12, paddingTop: 26 },
  policyRow: { paddingHorizontal: 16, gap: 10 },
  policyCard: { width: 230, padding: 14, gap: 8, borderRadius: radius.xl, borderWidth: StyleSheet.hairlineWidth },
  policyHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  policyIcon: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  lead: {
    marginHorizontal: 16,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  leadImage: { width: '100%', aspectRatio: 4 / 3 },
  leadShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '62%' },
  leadText: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, gap: 6 },
  leadSource: { opacity: 0.85 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, paddingHorizontal: 16 },
  card: { borderRadius: radius.lg, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  cardImage: { width: '100%', aspectRatio: 16 / 10 },
  cardText: { padding: 12, gap: 6, flex: 1 },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackLabel: { letterSpacing: 2 },
});
