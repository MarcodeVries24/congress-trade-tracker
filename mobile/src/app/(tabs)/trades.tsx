import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAccess } from '@/lib/access';
import { fetchTrades } from '@/lib/api';
import { haptic } from '@/lib/haptics';
import { rememberTrades } from '@/lib/trade-cache';
import {
  SORTS,
  activeChips,
  countActive,
  suggestAlertName,
  toAlertFilters,
  type TradeFilters,
} from '@/lib/trade-filters';
import { useAuthedRequest } from '@/lib/use-api';
import { useDebounced, usePaged } from '@/lib/use-paged';
import { radius, shadow, useTheme } from '@/theme';
import { Button, IconButton } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { FilterFields, parseTickers } from '@/ui/filter-fields';
import { Icon } from '@/ui/icon';
import { SearchBar } from '@/ui/search-bar';
import { TabHeader } from '@/ui/tab-header';
import { RowSkeleton } from '@/ui/skeleton';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';
import { TradeRow } from '@/ui/trade-row';

const PAGE = 40;

function sortOf(f: TradeFilters) {
  return SORTS.find((s) => s.key === f.sort) ?? SORTS[0];
}

/**
 * Every filter at once, in a sheet, the way booking apps do it: grouped, the
 * common ones open, the long lists folded, and a button that says how many
 * trades the choice will show before you commit to it.
 */
function FilterSheet({
  initial,
  onClose,
  onApply,
}: {
  initial: TradeFilters;
  onClose: () => void;
  onApply: (f: TradeFilters) => void;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const authed = useAuthedRequest();
  const [draft, setDraft] = useState<TradeFilters>(initial);
  const [tickerText, setTickerText] = useState((initial.tickers ?? []).join(', '));
  const [count, setCount] = useState<number | null>(null);

  const set = (patch: Partial<TradeFilters>) => setDraft((d) => ({ ...d, ...patch }));

  const withTickers = useMemo<TradeFilters>(
    () => ({ ...draft, tickers: parseTickers(tickerText) }),
    [draft, tickerText]
  );

  const settled = useDebounced(withTickers, 400);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchTrades({ ...settled, page: 1, limit: 1 }, await authed());
        if (!cancelled) setCount(res.total);
      } catch {
        if (!cancelled) setCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [settled, authed]);

  return (
    // Mounted only while open, so every opening starts from what is applied.
    <Modal
      visible
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined}
      onRequestClose={onClose}>
      <View
        style={[styles.sheet, { backgroundColor: c.background, paddingTop: Platform.OS === 'ios' ? 8 : insets.top }]}>
        <View style={[styles.sheetHead, { borderBottomColor: c.border }]}>
          <IconButton name="close" label="Close filters" onPress={onClose} />
          <Text variant="subhead">Filters</Text>
          <Tap
            onPress={() => {
              haptic.select();
              setDraft({ q: draft.q });
              setTickerText('');
            }}
            hitSlop={8}>
            <Text variant="callout" style={styles.clear}>
              Clear all
            </Text>
          </Tap>
        </View>

        <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
          <FilterFields
            draft={draft}
            set={set}
            tickerText={tickerText}
            setTickerText={setTickerText}
            mode="search"
          />
        </ScrollView>

        <View style={[styles.sheetFoot, { borderTopColor: c.border, paddingBottom: insets.bottom + 12 }]}>
          <Button
            label={
              count === null ? 'Show trades' : `Show ${count.toLocaleString()} ${count === 1 ? 'trade' : 'trades'}`
            }
            onPress={() => {
              haptic.tap();
              onApply(withTickers);
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

/** A filter preset handed over by another screen, e.g. "all of NVDA's trades". */
function parsePreset(raw: string | undefined): TradeFilters {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as TradeFilters;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * All trades, with every filter the website has, built for a thumb.
 *
 * The search and the most-used filters are one tap away across the top; the
 * rest live in a sheet. Whatever is set, the button at the bottom turns it
 * into an email alert in two taps, because "tell me when this happens again"
 * is the natural next thought after finding something.
 */
export default function TradesScreen() {
  const { c, scheme } = useTheme();
  const router = useRouter();
  const authed = useAuthedRequest();
  const params = useLocalSearchParams<{ filters?: string }>();
  const [filters, setFilters] = useState<TradeFilters>(() => parsePreset(params.filters));
  const [query, setQuery] = useState(filters.q ?? '');
  const [sheet, setSheet] = useState(false);
  const { status } = useAccess();

  // A tab stays mounted, so a preset handed over later ("See all of NVDA's
  // trades") arrives as a changed param rather than a fresh screen. Adopted
  // while rendering, the way React recommends for state that follows a prop.
  const [lastPreset, setLastPreset] = useState(params.filters);
  if (params.filters !== lastPreset) {
    setLastPreset(params.filters);
    if (params.filters) {
      const preset = parsePreset(params.filters);
      setFilters(preset);
      setQuery(preset.q ?? '');
    }
  }
  const q = useDebounced(query.trim(), 350);

  const applied = useMemo<TradeFilters>(() => ({ ...filters, q: q || undefined }), [filters, q]);

  const load = useCallback(
    async (page: number) => {
      const res = await fetchTrades({ ...applied, page, limit: PAGE }, await authed());
      rememberTrades(res.data);
      return res;
    },
    [applied, authed]
  );
  const list = usePaged(load);

  // Offset pages over a sort with ties can hand back a row twice.
  const rows = useMemo(() => {
    const seen = new Set<number>();
    return list.items.filter((t) => (seen.has(t.id) ? false : (seen.add(t.id), true)));
  }, [list.items]);

  const toggleIn = (key: 'types' | 'chamber', value: string) =>
    setFilters((f) => {
      const current = (f[key] ?? []) as string[];
      const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      return { ...f, [key]: next.length ? next : undefined };
    });

  const quick: { key: string; label: string; on: boolean; toggle: () => void }[] = [
    { key: 'P', label: 'Purchases', on: Boolean(filters.types?.includes('P')), toggle: () => toggleIn('types', 'P') },
    { key: 'S', label: 'Sales', on: Boolean(filters.types?.includes('S')), toggle: () => toggleIn('types', 'S') },
    {
      key: 'house',
      label: 'House',
      on: Boolean(filters.chamber?.includes('house')),
      toggle: () => toggleIn('chamber', 'house'),
    },
    {
      key: 'senate',
      label: 'Senate',
      on: Boolean(filters.chamber?.includes('senate')),
      toggle: () => toggleIn('chamber', 'senate'),
    },
    {
      key: 'big',
      label: '$50K+',
      on: filters.minAmount === 50001,
      toggle: () => setFilters((f) => ({ ...f, minAmount: f.minAmount === 50001 ? undefined : 50001 })),
    },
    {
      key: 'late',
      label: 'Filed late',
      on: filters.filedStatus === 'late',
      toggle: () => setFilters((f) => ({ ...f, filedStatus: f.filedStatus === 'late' ? undefined : 'late' })),
    },
  ];
  // The search bar shows the text search; the quick row shows these two.
  const quickKeys = new Set(['q', 'types', 'chamber']);
  const extraChips = activeChips(filters).filter(
    (chip) =>
      !quickKeys.has(chip.key) &&
      !(chip.key === 'minAmount' && filters.minAmount === 50001) &&
      !(chip.key === 'filedStatus' && filters.filedStatus === 'late')
  );
  const active = countActive(filters);
  const sort = sortOf(filters);

  // Everything but search, chamber, asset type and sort is a Pro filter, which
  // the server silently ignores for anyone else. Past the paywall that is no
  // one; this is for the moments it is someone (a development build's skip, a
  // lapsed subscription), so the page says why nothing changed.
  const proFiltersIgnored =
    status !== 'pro' &&
    status !== 'loading' &&
    countActive({ ...filters, chamber: undefined, assetTypes: undefined }) > 0;

  const header = (
    <View style={styles.header}>
      <TabHeader title="Trades" />
      <View style={styles.searchRow}>
        <View style={styles.flex}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Member, ticker or company" />
        </View>
        <Tap
          feedback="tap"
          scaleTo={0.92}
          onPress={() => setSheet(true)}
          accessibilityLabel="Filters"
          style={[
            styles.filterButton,
            { backgroundColor: active ? c.primary : c.surface, borderColor: active ? c.primary : c.border },
          ]}>
          <Icon name="options-outline" size={22} color={active ? c.primaryText : c.text} />
          {active ? (
            <View style={[styles.badge, { backgroundColor: c.accent, borderColor: c.background }]}>
              <Text variant="footnote" color="#FFFFFF" style={styles.badgeText}>
                {active}
              </Text>
            </View>
          ) : null}
        </Tap>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Tap
          scaleTo={0.95}
          onPress={() => setSheet(true)}
          style={[styles.chip, { backgroundColor: c.surface, borderColor: c.border }]}>
          <Icon name="swap-vertical" size={15} color={c.text} />
          <Text variant="callout" style={styles.bold}>
            {sort.label}
          </Text>
        </Tap>
        {quick.map((chip) => (
          <Tap
            key={chip.key}
            scaleTo={0.95}
            onPress={() => {
              haptic.select();
              chip.toggle();
            }}
            style={[
              styles.chip,
              chip.on
                ? { backgroundColor: c.primary, borderColor: c.primary }
                : { backgroundColor: c.surface, borderColor: c.border },
            ]}>
            <Text variant="callout" color={chip.on ? c.primaryText : c.text} style={styles.bold}>
              {chip.label}
            </Text>
          </Tap>
        ))}
      </ScrollView>

      {extraChips.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {extraChips.map((chip) => (
            <Tap
              key={chip.key}
              scaleTo={0.95}
              onPress={() => {
                haptic.select();
                setFilters((f) => chip.clear(f));
              }}
              style={[styles.chip, { backgroundColor: c.accentSoft, borderColor: c.accentSoft }]}>
              <Text variant="callout" tone="accent" style={styles.bold}>
                {chip.label}
              </Text>
              <Icon name="close" size={14} color={c.accent} />
            </Tap>
          ))}
        </ScrollView>
      ) : null}

      {proFiltersIgnored ? (
        <Tap
          onPress={() => router.push(status === 'signed-out' ? '/sign-in' : '/paywall')}
          style={[styles.notice, { backgroundColor: c.warnSoft }]}>
          <Icon name="lock-closed" size={16} color={c.warn} />
          <Text variant="caption" style={styles.flex}>
            {status === 'signed-out'
              ? 'These filters need CongTrade Pro. Sign in to apply them; for now the list shows every trade.'
              : 'These filters need CongTrade Pro, so the list still shows every trade.'}
          </Text>
          <Icon name="chevron-forward" size={16} color={c.warn} />
        </Tap>
      ) : null}

      <Text variant="caption" tone="muted" style={styles.count}>
        {list.status === 'ready'
          ? `${list.total.toLocaleString()} ${list.total === 1 ? 'trade' : 'trades'}`
          : list.status === 'loading'
            ? 'Searching…'
            : ''}
      </Text>
      {list.status === 'loading' && rows.length === 0 ? <RowSkeleton count={7} /> : null}
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <FlatList
        data={rows}
        keyExtractor={(t) => String(t.id)}
        renderItem={({ item }) => <TradeRow trade={item} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          list.status === 'error' ? (
            <EmptyState
              icon="cloud-offline-outline"
              title="Couldn't load trades"
              body={list.error}
              action="Try again"
              onAction={list.retry}
              compact
            />
          ) : list.status === 'ready' ? (
            <EmptyState
              icon="funnel-outline"
              title="No trades match"
              body="Try removing a filter or two."
              action={active ? 'Clear filters' : undefined}
              onAction={() => setFilters({})}
              compact
            />
          ) : null
        }
        ListFooterComponent={
          list.hasMore ? (
            <View style={styles.footer}>
              <ActivityIndicator />
            </View>
          ) : (
            <View style={{ height: 110 }} />
          )
        }
        onEndReached={list.loadMore}
        onEndReachedThreshold={0.7}
        refreshControl={
          <RefreshControl refreshing={list.refreshing} onRefresh={list.refresh} tintColor={c.textMuted} />
        }
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.list}
      />

      {/* The step after finding something: be told when it happens again. */}
      <View style={[styles.fabWrap, { bottom: 14 }]} pointerEvents="box-none">
        <Tap
          feedback="commit"
          scaleTo={0.95}
          onPress={() =>
            router.push({
              pathname: '/alert/[id]',
              params: {
                id: 'new',
                filters: JSON.stringify(toAlertFilters(applied)),
                name: suggestAlertName(applied),
              },
            })
          }
          style={[styles.fab, { backgroundColor: c.primary }, scheme === 'light' ? shadow.raised : null]}>
          <Icon name="notifications" size={18} color={c.primaryText} />
          <Text variant="bodyStrong" color={c.primaryText}>
            {active || q ? 'Get alerts for this search' : 'Get alerts'}
          </Text>
        </Tap>
      </View>

      {sheet ? (
        <FilterSheet
          initial={filters}
          onClose={() => setSheet(false)}
          onApply={(f) => {
            setFilters({ ...f, q: undefined });
            setSheet(false);
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  bold: { fontWeight: '600' },
  list: { paddingBottom: 24 },
  header: { gap: 12, paddingTop: 4 },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 },
  filterButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  badgeText: { fontWeight: '800', fontSize: 11, lineHeight: 13 },
  chips: { paddingHorizontal: 16, gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  count: { paddingHorizontal: 16 },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    padding: 12,
    borderRadius: radius.lg,
  },
  footer: { paddingVertical: 24, alignItems: 'center', paddingBottom: 110 },
  fabWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 22,
    height: 52,
    borderRadius: radius.pill,
  },
  sheet: { flex: 1 },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  clear: { fontWeight: '700', textDecorationLine: 'underline', paddingHorizontal: 8 },
  sheetBody: { paddingHorizontal: 16, paddingBottom: 24 },
  section: { paddingVertical: 20, borderBottomWidth: StyleSheet.hairlineWidth, gap: 14 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionBody: { gap: 10 },
  input: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
  sheetFoot: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
