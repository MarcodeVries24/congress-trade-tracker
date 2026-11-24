import { useAuth } from '@clerk/clerk-expo';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, SectionList, StyleSheet, View } from 'react-native';

import { ApiError, fetchAlerts, fetchAllAlertTrades, type AlertFeedTrade, type Trade } from '@/lib/api';
import { getPolitician, settleAll } from '@/lib/detail-cache';
import { tradesFromPolitician } from '@/lib/detail-trades';
import { useFollows } from '@/lib/follows';
import { sentLabel } from '@/lib/sent-label';
import { rememberTrades } from '@/lib/trade-cache';
import { useAuthedRequest } from '@/lib/use-api';
import { radius, useTheme } from '@/theme';
import { Avatar } from '@/ui/avatar';
import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { Icon } from '@/ui/icon';
import { PushSwitchCard } from '@/ui/push-primer';
import { Segmented } from '@/ui/segmented';
import { TradeRowSkeleton } from '@/ui/skeleton';
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

const VIEWS = [
  { key: 'alerts', label: 'From your alerts' },
  { key: 'watchlist', label: 'Politician watchlist' },
] as const;
type ViewKey = (typeof VIEWS)[number]['key'];

/** `alertId` on a section of what one alert sent: its heading opens that alert's trades. */
type Section = { key: string; title: string; detail?: string; alertId?: string; data: Trade[] };

/** One section per alert and send, newest first: one notification's worth. */
function byAlert(trades: AlertFeedTrade[]): Section[] {
  const sections: Section[] = [];
  for (const t of trades) {
    const key = `${t.alert_id}:${t.sent_at}`;
    const last = sections[sections.length - 1];
    if (last && last.key === key) last.data.push(t);
    else sections.push({ key, title: t.alert_name, detail: sentLabel(t.sent_at), alertId: t.alert_id, data: [t] });
  }
  return sections;
}

/**
 * Alerts: the trades your alerts sent, or what the politicians on your
 * watchlist have done, each newest first.
 *
 * Opens on the alerts for someone who has any, and on the watchlist for
 * someone who has none, so it never opens on an empty list that looks broken.
 *
 * The watchlist is assembled from each followed member's latest trades, which
 * the detail cache already holds, rather than a fresh query per visit.
 *
 * Saved alerts, the ones that arrive when you are not looking, are one tap
 * away at the top, with the switch for push notifications on this phone
 * under them.
 */
export default function AlertsScreen() {
  const { c } = useTheme();
  const router = useRouter();
  const authed = useAuthedRequest();
  const follows = useFollows();
  const { isLoaded } = useAuth();
  const [trades, setTrades] = useState<Trade[] | null>(null);
  const [sent, setSent] = useState<AlertFeedTrade[] | null | 'failed'>(null);
  const [more, setMore] = useState(false);
  // How many alerts there are, paused ones included; null until known.
  const [alertCount, setAlertCount] = useState<number | null>(null);
  const [chosen, setChosen] = useState<ViewKey | null>(null);
  const [emailCount, setEmailCount] = useState<number | null | 'signed-out'>(null);
  const [devices, setDevices] = useState<number | null>(null);
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
    },
    [authed, follows.members]
  );

  const loadAlerts = useCallback(async () => {
    const options = await authed();
    await Promise.all([
      (async () => {
        try {
          const list = await fetchAlerts(options);
          setEmailCount(list.alerts.filter((a) => a.active).length);
          setAlertCount(list.alerts.length);
          setDevices(list.pushDevices ?? null);
        } catch (err) {
          setEmailCount(err instanceof ApiError && err.status === 401 ? 'signed-out' : null);
          setAlertCount((prev) => prev ?? 0);
        }
      })(),
      (async () => {
        try {
          const feed = await fetchAllAlertTrades(options);
          rememberTrades(feed.trades);
          setSent(feed.trades);
          setMore(feed.trades.length >= feed.max);
        } catch {
          setSent((prev) => (Array.isArray(prev) ? prev : 'failed'));
        }
      })(),
    ]);
  }, [authed]);

  // Not before Clerk has read its session, or the alerts would come back
  // "sign in" to someone who has.
  useFocusEffect(
    useCallback(() => {
      if (!isLoaded) return;
      void load();
      void loadAlerts();
    }, [isLoaded, load, loadAlerts])
  );

  const view: ViewKey | null = chosen ?? (alertCount === null ? null : alertCount > 0 ? 'alerts' : 'watchlist');

  const watchlist = useMemo<Section[]>(() => {
    const groups = new Map<string, Trade[]>();
    for (const t of trades ?? []) {
      const key = bucket(t.filing_date);
      groups.set(key, [...(groups.get(key) ?? []), t]);
    }
    return [...groups.entries()].map(([title, data]) => ({ key: title, title, data }));
  }, [trades]);
  const fromAlerts = useMemo<Section[]>(() => (Array.isArray(sent) ? byAlert(sent) : []), [sent]);
  const sections = view === 'alerts' ? fromAlerts : view === 'watchlist' ? watchlist : [];

  const following = follows.members.length;

  const header = (
    <View>
      <TabHeader title="Alerts" subtitle="What your alerts found, and what your watchlist traded." />

      <View style={styles.inset}>
        <Tap
          feedback="tap"
          scaleTo={0.98}
          onPress={() => router.push(emailCount === 'signed-out' ? '/sign-in' : '/email-alerts')}
          style={[styles.emailCard, { backgroundColor: c.surface, borderColor: c.border }]}>
          <View style={[styles.emailIcon, { backgroundColor: c.accentSoft }]}>
            <Icon name="options-outline" size={22} color={c.accent} />
          </View>
          <View style={styles.emailText}>
            <Text variant="bodyStrong">Your alerts</Text>
            <Text variant="caption" tone="muted">
              {emailCount === 'signed-out'
                ? 'Sign in to be told when a filing matches your filters'
                : emailCount === null
                  ? 'A notification or email when a filing matches'
                  : emailCount === 0
                    ? 'None active yet. Set one up with any filter in a minute.'
                    : `${emailCount} active, by push notification or email`}
            </Text>
          </View>
          <Icon name="chevron-forward" size={18} color={c.textFaint} />
        </Tap>
        {emailCount !== 'signed-out' ? <PushSwitchCard devices={devices} /> : null}
      </View>

      <View style={styles.views}>
        <Segmented options={VIEWS} value={view ?? 'alerts'} onChange={setChosen} />
      </View>

      {view === 'watchlist' && following ? (
        <View style={styles.followRow}>
          <View style={styles.faces}>
            {follows.members.slice(0, 4).map((m, i) => (
              <View key={m.slug} style={[styles.face, { marginLeft: i ? -10 : 0, borderColor: c.background }]}>
                <Avatar uri={m.photo_url} name={m.name} party={m.party} size={FACE} />
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

  const empty =
    view === null ? (
      <TradeRowSkeleton count={6} />
    ) : view === 'alerts' ? (
      sent === null ? (
        <TradeRowSkeleton count={6} />
      ) : sent === 'failed' ? (
        <EmptyState
          icon="cloud-offline-outline"
          title="Couldn't load your alerts' trades"
          body="Check your connection and try again."
          action="Try again"
          onAction={() => void loadAlerts()}
          compact
        />
      ) : alertCount ? (
        <EmptyState
          icon="hourglass-outline"
          title="Nothing found yet"
          body="When a new filing matches one of your alerts, its trades land here."
          compact
        />
      ) : (
        <EmptyState
          icon="notifications-outline"
          title="No alerts yet"
          body="Set one up with any filter, and the trades it finds land here."
          action="Set up an alert"
          onAction={() => router.push('/email-alerts')}
          compact
        />
      )
    ) : following === 0 ? (
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
      <TradeRowSkeleton count={6} />
    ) : (
      <EmptyState
        icon="time-outline"
        title="Quiet for now"
        body={`Nobody on your watchlist has filed a trade in the last ${WINDOW_DAYS} days. New filings appear here as they land.`}
        compact
      />
    );

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <SectionList
        sections={sections}
        keyExtractor={(t, i) => `${t.id}:${i}`}
        renderItem={({ item, index, section }) => <TradeRow trade={item} divider={index < section.data.length - 1} />}
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHead, { backgroundColor: c.background }]}>
            {section.alertId ? (
              <Tap
                hitSlop={6}
                accessibilityRole="link"
                onPress={() => router.push({ pathname: '/alert-trades/[id]', params: { id: section.alertId! } })}
                style={styles.alertHead}>
                <Icon name="notifications" size={14} color={c.accent} />
                <Text variant="callout" numberOfLines={1} style={styles.alertName}>
                  {section.title}
                </Text>
                <Text variant="footnote" tone="faint">
                  {section.detail}
                </Text>
              </Tap>
            ) : (
              <Text variant="label" tone="faint">
                {section.title.toUpperCase()}
              </Text>
            )}
          </View>
        )}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          view === 'alerts' && more ? (
            <Text variant="caption" tone="faint" style={styles.footer}>
              The latest trades your alerts sent. Each alert keeps its own list under &ldquo;Your alerts&rdquo;.
            </Text>
          ) : null
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void Promise.all([load(true), loadAlerts()]).finally(() => setRefreshing(false));
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

/** The watchlist faces: photo size, and the ring that separates them. */
const FACE = 28;
const FACE_RING = 2;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { paddingBottom: 40 },
  inset: { paddingHorizontal: 16, paddingTop: 16, gap: 10 },
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
  followRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 18 },
  faces: { flexDirection: 'row' },
  // A ring in the background colour around each 28pt photo, so the overlap
  // reads as separate faces. Sized exactly and rounded to half of that: a
  // radius past half the width draws a lopsided shape on iOS, not a circle.
  face: {
    width: FACE + 2 * FACE_RING,
    height: FACE + 2 * FACE_RING,
    borderRadius: FACE / 2 + FACE_RING,
    borderWidth: FACE_RING,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  followText: { flex: 1 },
  manage: { fontWeight: '700', textDecorationLine: 'underline' },
  views: { paddingHorizontal: 16, paddingTop: 18 },
  alertHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  alertName: { flex: 1, fontWeight: '700' },
  footer: { textAlign: 'center', paddingHorizontal: 24, paddingVertical: 24 },
  sectionHead: { paddingHorizontal: 16, paddingTop: 22, paddingBottom: 4 },
  ctas: { paddingHorizontal: 24, gap: 10 },
});
