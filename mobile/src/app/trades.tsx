import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchTrades } from '@/lib/api';
import { memberDisplayNameFromFiledName } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { rememberTrades } from '@/lib/trade-cache';
import {
  AMOUNT_RANGES,
  ASSET_TYPES,
  CHAMBERS,
  FILED,
  MARKET_CAPS,
  MIN_AMOUNTS,
  OWNERS,
  PARTIES,
  SORTS,
  TYPES,
  US_STATES,
  WINDOWS,
  activeChips,
  countActive,
  daysAgo,
  suggestAlertName,
  toAlertFilters,
  windowFor,
  type TradeFilters,
} from '@/lib/trade-filters';
import { useAuthedRequest } from '@/lib/use-api';
import { useDebounced, usePaged } from '@/lib/use-paged';
import { radius, shadow, useTheme } from '@/theme';
import { Button, IconButton } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { Icon } from '@/ui/icon';
import { MemberPicker } from '@/ui/member-picker';
import { SearchBar } from '@/ui/search-bar';
import { RowSkeleton } from '@/ui/skeleton';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';
import { ToggleChips } from '@/ui/toggle-chips';
import { TradeRow } from '@/ui/trade-row';

const PAGE = 40;

function sortOf(f: TradeFilters) {
  return SORTS.find((s) => s.key === f.sort) ?? SORTS[0];
}

/** One section of the filter sheet. Long lists fold until asked for. */
function Section({
  title,
  hint,
  children,
  foldable,
  count,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  foldable?: boolean;
  count?: number;
}) {
  const { c } = useTheme();
  const [open, setOpen] = useState(!foldable || Boolean(count));
  const heading = (
    <>
      <View style={styles.flex}>
        <Text variant="subhead">
          {title}
          {count ? (
            <Text variant="subhead" tone="accent">
              {'  '}
              {count}
            </Text>
          ) : null}
        </Text>
        {hint ? (
          <Text variant="caption" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      {foldable ? <Icon name={open ? 'chevron-up' : 'chevron-down'} size={20} color={c.textMuted} /> : null}
    </>
  );
  return (
    <View style={[styles.section, { borderBottomColor: c.border }]}>
      {foldable ? (
        <Tap onPress={() => setOpen((o) => !o)} scaleTo={0.99} style={styles.sectionHead}>
          {heading}
        </Tap>
      ) : (
        <View style={styles.sectionHead}>{heading}</View>
      )}
      {open ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
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
  const list = (values: string[]) => (values.length ? values : undefined);

  const withTickers = useMemo<TradeFilters>(() => {
    const tickers = tickerText
      .split(/[\s,]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    return { ...draft, tickers: tickers.length ? tickers : undefined };
  }, [draft, tickerText]);

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

  const window = windowFor(draft.dateFrom);

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
          <Section title="Sort by">
            <ToggleChips
              single
              options={SORTS}
              selected={[sortOf(draft).key]}
              onChange={([key]) => {
                const s = SORTS.find((x) => x.key === key) ?? SORTS[0];
                set({ sort: s.key, order: s.order });
              }}
            />
          </Section>

          <Section title="Transaction">
            <ToggleChips options={TYPES} selected={draft.types ?? []} onChange={(v) => set({ types: list(v) })} />
          </Section>

          <Section title="Chamber" hint="Both, if neither is picked">
            <ToggleChips
              options={CHAMBERS}
              selected={draft.chamber ?? []}
              onChange={(v) => set({ chamber: list(v) as ('house' | 'senate')[] | undefined })}
            />
          </Section>

          <Section title="Party">
            <ToggleChips options={PARTIES} selected={draft.parties ?? []} onChange={(v) => set({ parties: list(v) })} />
          </Section>

          <Section title="Members" count={new Set((draft.members ?? []).map(memberDisplayNameFromFiledName)).size}>
            <MemberPicker value={draft.members ?? []} onChange={(v) => set({ members: list(v) })} />
          </Section>

          <Section title="Tickers" hint="Separate with commas">
            <TextInput
              value={tickerText}
              onChangeText={setTickerText}
              placeholder="e.g. NVDA, TSLA"
              placeholderTextColor={c.textFaint}
              autoCapitalize="characters"
              autoCorrect={false}
              style={[styles.input, { backgroundColor: c.surface, borderColor: c.border, color: c.text }]}
            />
          </Section>

          <Section title="Minimum amount" hint="The lowest value of the disclosed range">
            <ToggleChips
              single
              options={MIN_AMOUNTS}
              selected={draft.minAmount ? [String(draft.minAmount)] : []}
              onChange={([v]) => set({ minAmount: v ? Number(v) : undefined })}
            />
          </Section>

          <Section title="Filed" hint="By the date the disclosure was published">
            <ToggleChips
              single
              options={WINDOWS.filter((w) => w.key !== 'any')}
              selected={window === 'any' ? [] : [window]}
              onChange={([v]) => {
                const w = WINDOWS.find((x) => x.key === v);
                set({ dateFrom: w && w.days ? daysAgo(w.days) : undefined, dateTo: undefined });
              }}
            />
          </Section>

          <Section title="Timeliness" hint="The law allows 45 days">
            <ToggleChips
              single
              options={FILED.filter((f) => f.key !== 'any')}
              selected={draft.filedStatus ? [draft.filedStatus] : []}
              onChange={([v]) => set({ filedStatus: (v as 'late' | 'onTime' | undefined) || undefined })}
            />
          </Section>

          <Section title="Asset type" foldable count={draft.assetTypes?.length}>
            <ToggleChips
              options={ASSET_TYPES}
              selected={draft.assetTypes ?? []}
              onChange={(v) => set({ assetTypes: list(v) })}
            />
          </Section>

          <Section title="Owner" foldable count={draft.owners?.length}>
            <ToggleChips options={OWNERS} selected={draft.owners ?? []} onChange={(v) => set({ owners: list(v) })} />
          </Section>

          <Section title="Company size" foldable count={draft.marketCapTiers?.length}>
            <ToggleChips
              options={MARKET_CAPS}
              selected={draft.marketCapTiers ?? []}
              onChange={(v) => set({ marketCapTiers: list(v) })}
            />
          </Section>

          <Section title="Exact amount ranges" foldable count={draft.amountRanges?.length}>
            <ToggleChips
              options={AMOUNT_RANGES}
              selected={draft.amountRanges ?? []}
              onChange={(v) => set({ amountRanges: list(v) })}
            />
          </Section>

          <Section title="State" foldable count={draft.states?.length}>
            <ToggleChips options={US_STATES} selected={draft.states ?? []} onChange={(v) => set({ states: list(v) })} />
          </Section>
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
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const authed = useAuthedRequest();
  const params = useLocalSearchParams<{ filters?: string }>();
  const [filters, setFilters] = useState<TradeFilters>(() => parsePreset(params.filters));
  const [query, setQuery] = useState(filters.q ?? '');
  const [sheet, setSheet] = useState(false);
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

  const header = (
    <View style={styles.header}>
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
      <View style={[styles.fabWrap, { bottom: insets.bottom + 14 }]} pointerEvents="box-none">
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
  count: { paddingHorizontal: 20 },
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
  sheetBody: { paddingHorizontal: 20, paddingBottom: 24 },
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
  sheetFoot: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
