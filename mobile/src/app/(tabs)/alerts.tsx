import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, View } from 'react-native';

import { ApiError, fetchAlerts, type Trade } from '@/lib/api';
import { getPolitician, settleAll } from '@/lib/detail-cache';
import { tradesFromPolitician } from '@/lib/detail-trades';
import { useFollows } from '@/lib/follows';
import { rememberTrades } from '@/lib/trade-cache';
import { useAuthedRequest } from '@/lib/use-api';
import { radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/avatar';
import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { Icon } from '@/ui/icon';
import { RowSkeleton } from '@/ui/skeleton';
import { TabHeader } from '@/ui/tab-header';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';
import { TradeRow } from '@/ui/trade-row';

const WINDOW_DAYS = 120;

function bucket(iso: string | null): string {
  if (!iso) return 'Earlier';
  const days = (Date.now() - new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime()) / 86_400_000;
  if (days < 1.5) return 'Today';
  if (days < 7) return 'This week';
  if (days < 31) return 'This month';
  return 'Earlier';
}

/**
 * Alerts: what the politicians on your watchlist have done, newest first.
 *
 * Assembled from each followed member's latest trades, which the detail cache
 * already holds for the Watchlist, rather than a fresh query per visit.
 *
 * Email alerts, the ones that arrive when you are not looking, are one tap
 * away at the top.
 */
export default function AlertsScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const authed = useAuthedRequest();
  const follows = useFollows();
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [emailCount, setEmailCount] = useState<number | null | 'signed-out'>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    async (fresh = false) => {
      const options = await authed();
      const members = await settleAll(follows.members.map((m) => getPolitician(m.slug, options, fresh)));
      const all = members.flatMap(tradesFromPolitician);
      const cutoff = Date.now() - WINDOW_DAYS * 86_400_000;
      const unique = new Map<number, Trade>();
      for (const t of all) {
        if (!t.filing_date || new Date(t.filing_date).getTime() < cutoff) continue;
        if (!unique.has(t.id)) unique.set(t.id, t);
      }
      const sorted = [...unique.values()].sort(
        (a, b) => (b.filing_date ?? '').localeCompare(a.filing_date ?? '') || b.id - a.id
      );
      rememberTrades(sorted);
      setTrades(sorted);
      setRefreshing(false);

      try {
        const list = await fetchAlerts(options);
        setEmailCount(list.alerts.filter((a) => a.active).length);
      } catch (err) {
        setEmailCount(err instanceof ApiError && err.status === 401 ? 'signed-out' : null);
      }
    },
    [authed, follows.members]
  );

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const sections = useMemo(() => {
    const groups = new Map<string, Trade[]>();
    for (const t of trades ?? []) {
      const key = bucket(t.filing_date);
      groups.set(key, [...(groups.get(key) ?? []), t]);
    }
    return [...groups.entries()].map(([title, data]) => ({ title, data }));
  }, [trades]);

  const following = follows.members.length;

  const header = (
    <View>
      <TabHeader title="Alerts" subtitle="Every trade by the politicians on your watchlist." />

      <View style={styles.inset}>
        <Tap
          feedback="tap"
          scaleTo={0.98}
          onPress={() => router.push(emailCount === 'signed-out' ? '/sign-in' : '/email-alerts')}
          style={[styles.emailCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={[styles.emailIcon, { backgroundColor: c.accentSoft }]}>
            <Icon name="mail-unread-outline" size={22} color={c.accent} />
          </View>
          <View style={styles.emailText}>
            <Text variant="bodyStrong">Email alerts</Text>
            <Text variant="caption" tone="muted">
              {emailCount === 'signed-out'
                ? 'Sign in to get an email when a filing matches'
                : emailCount === null
                  ? 'An email the moment a filing matches'
                  : emailCount === 0
                    ? 'None active yet. Set one up in a minute.'
                    : `${emailCount} active, delivered by email`}
            </Text>
          </View>
          <Icon name="chevron-forward" size={18} color={c.textFaint} />
        </Tap>
      </View>

      {following ? (
        <View style={styles.followRow}>
          <View style={styles.faces}>
            {follows.members.slice(0, 4).map((m, i) => (
              <View key={m.slug} style={[styles.face, { marginLeft: i ? -10 : 0, borderColor: c.background }]}>
                <Avatar uri={m.photo_url} name={m.name} party={m.party} size={28} />
              </View>
            ))}
          </View>
          <Text variant="caption" tone="muted" style={styles.followText}>
            Watching {follows.members.length} {follows.members.length === 1 ? 'politician' : 'politicians'}
          </Text>
          <Tap onPress={() => router.push({ pathname: '/politicians', params: { view: 'watchlist' } })} hitSlop={8}>
            <Text variant="callout" style={styles.manage}>
              Manage
            </Text>
          </Tap>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <SectionList
        sections={sections}
        keyExtractor={(t) => String(t.id)}
        renderItem={({ item, index, section }) => <TradeRow trade={item} divider={index < section.data.length - 1} />}
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHead, { backgroundColor: c.background }]}>
            <Text variant="label" tone="faint">
              {section.title.toUpperCase()}
            </Text>
          </View>
        )}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={header}
        ListEmptyComponent={
          following === 0 ? (
            <View>
              <EmptyState
                icon="notifications-outline"
                title="Follow a politician to fill this up"
                body="Every trade by the politicians on your watchlist lands here, newest first."
                compact
              />
              <View style={styles.ctas}>
                <Button
                  label="Browse politicians"
                  icon="people-outline"
                  onPress={() => router.push({ pathname: '/politicians', params: { view: 'all' } })}
                />
              </View>
            </View>
          ) : trades === null ? (
            <RowSkeleton count={6} />
          ) : (
            <EmptyState
              icon="time-outline"
              title="Quiet for now"
              body={`Nobody on your watchlist has filed a trade in the last ${WINDOW_DAYS} days. New filings appear here as they land.`}
              compact
            />
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load(true);
            }}
            tintColor={c.textMuted}
          />
        }
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingBottom: 40 },
  inset: { paddingHorizontal: 16, paddingTop: 16 },
  emailCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  emailIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  emailText: { flex: 1, gap: 2 },
  followRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 18 },
  faces: { flexDirection: 'row' },
  face: { borderWidth: 2, borderRadius: 18 },
  followText: { flex: 1 },
  manage: { fontWeight: '700', textDecorationLine: 'underline' },
  sectionHead: { paddingHorizontal: 20, paddingTop: 22, paddingBottom: 4 },
  ctas: { paddingHorizontal: 24, gap: 10 },
});
