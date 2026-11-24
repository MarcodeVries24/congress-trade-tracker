import { useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

import { memberDisplayNameFromFiledName, shortDate } from '@/lib/format';
import {
  AMOUNT_RANGES,
  ASSET_TYPES,
  CHAMBERS,
  EARLIEST_FILED,
  EARLIEST_TRADED,
  FILED,
  MARKET_CAPS,
  MIN_AMOUNTS,
  OWNERS,
  PARTIES,
  SORTS,
  TYPES,
  US_STATES,
  WINDOWS,
  daysAgo,
  windowFor,
  type TradeFilters,
} from '@/lib/trade-filters';
import { radius, useTheme } from '@/theme';
import { DayPicker, todayIso } from '@/ui/day-picker';
import { Icon } from '@/ui/icon';
import { MemberPicker } from '@/ui/member-picker';
import { TickerPicker } from '@/ui/ticker-picker';
import { Tap } from '@/ui/tap';
import { Text } from '@/ui/text';
import { ToggleChips } from '@/ui/toggle-chips';

/** One section of the filters. Long lists fold until asked for. */
export function FilterSection({
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
  // Slides to its new place when a section above it grows or shrinks (a
  // calendar opening, a folded section opening) instead of jumping there.
  return (
    <Animated.View layout={SECTION_MOTION} style={[styles.section, { borderBottomColor: c.border }]}>
      {foldable ? (
        <Tap onPress={() => setOpen((o) => !o)} scaleTo={0.99} style={styles.sectionHead}>
          {heading}
        </Tap>
      ) : (
        <View style={styles.sectionHead}>{heading}</View>
      )}
      {open ? <View style={styles.sectionBody}>{children}</View> : null}
    </Animated.View>
  );
}

/**
 * Every filter the website has, as sections: the Trades tab's filter sheet
 * and the alert editor both draw these, so an alert can be exactly any search.
 *
 * `mode` drops what has no meaning for an alert (sort, and the filed and
 * traded in-the-last-N-days windows: an alert only ever sees filings that
 * arrive after it is saved) and adds the keyword, which a search takes from
 * its search bar. Members and tickers are picked from searchable lists.
 */
export function FilterFields({
  draft,
  set,
  mode,
}: {
  draft: TradeFilters;
  set: (patch: Partial<TradeFilters>) => void;
  mode: 'search' | 'alert';
}) {
  const { c } = useTheme();
  // Which calendar is open, across the whole sheet: one at a time. Each date
  // filter used to keep its own, so Traded's and Filed's could both be open,
  // one of them often off screen.
  const [calendar, setCalendar] = useState<string | null>(null);
  const list = (values: string[]) => (values.length ? values : undefined);
  const input = [styles.input, { backgroundColor: c.surface, borderColor: c.border, color: c.text }];
  const sort = SORTS.find((s) => s.key === draft.sort) ?? SORTS[0];

  return (
    <>
      {mode === 'search' ? (
        <FilterSection title="Sort by">
          <ToggleChips
            single
            options={SORTS}
            selected={[sort.key]}
            onChange={([key]) => {
              const s = SORTS.find((x) => x.key === key) ?? SORTS[0];
              set({ sort: s.key, order: s.order });
            }}
          />
        </FilterSection>
      ) : (
        <FilterSection title="Keyword" hint="A member, company or asset name, as in the search box">
          <TextInput
            value={draft.q ?? ''}
            onChangeText={(q) => set({ q: q || undefined })}
            placeholder="Any, or e.g. semiconductor"
            placeholderTextColor={c.textFaint}
            autoCorrect={false}
            maxLength={120}
            style={input}
          />
        </FilterSection>
      )}

      {mode === 'search' ? (
        <FilterSection title="Traded" hint="By the date the trade was made, past days or exact dates">
          <DateWindow
            name="traded"
            calendar={calendar}
            setCalendar={setCalendar}
            from={draft.tradedFrom}
            to={draft.tradedTo}
            earliest={EARLIEST_TRADED}
            onChange={(tradedFrom, tradedTo) => set({ tradedFrom, tradedTo })}
          />
        </FilterSection>
      ) : null}

      {mode === 'search' ? (
        <FilterSection title="Filed" hint="By the date the disclosure was published, past days or exact dates">
          <DateWindow
            name="filed"
            calendar={calendar}
            setCalendar={setCalendar}
            from={draft.dateFrom}
            to={draft.dateTo}
            earliest={EARLIEST_FILED}
            onChange={(dateFrom, dateTo) => set({ dateFrom, dateTo })}
          />
        </FilterSection>
      ) : null}

      <FilterSection title="Transaction" hint="Sales include partial sales, marked Sold (P)">
        <ToggleChips options={TYPES} selected={draft.types ?? []} onChange={(v) => set({ types: list(v) })} />
      </FilterSection>

      <FilterSection title="Chamber" hint="Both, if neither is picked">
        <ToggleChips
          options={CHAMBERS}
          selected={draft.chamber ?? []}
          onChange={(v) => set({ chamber: list(v) as ('house' | 'senate')[] | undefined })}
        />
      </FilterSection>

      <FilterSection title="Party">
        <ToggleChips options={PARTIES} selected={draft.parties ?? []} onChange={(v) => set({ parties: list(v) })} />
      </FilterSection>

      <FilterSection title="Members" count={new Set((draft.members ?? []).map(memberDisplayNameFromFiledName)).size}>
        <MemberPicker value={draft.members ?? []} onChange={(v) => set({ members: list(v) })} />
      </FilterSection>

      <FilterSection title="Tickers" count={draft.tickers?.length}>
        <TickerPicker value={draft.tickers ?? []} onChange={(v) => set({ tickers: list(v) })} />
      </FilterSection>

      <FilterSection title="Minimum amount" hint="The lowest value of the disclosed range">
        <ToggleChips
          single
          options={MIN_AMOUNTS}
          selected={draft.minAmount ? [String(draft.minAmount)] : []}
          onChange={([v]) => set({ minAmount: v ? Number(v) : undefined })}
        />
      </FilterSection>

      <FilterSection title="Timeliness" hint="The law allows 45 days">
        <ToggleChips
          single
          options={FILED.filter((f) => f.key !== 'any')}
          selected={draft.filedStatus ? [draft.filedStatus] : []}
          onChange={([v]) => set({ filedStatus: (v as 'late' | 'onTime' | undefined) || undefined })}
        />
      </FilterSection>

      <FilterSection title="Asset type" foldable count={draft.assetTypes?.length}>
        <ToggleChips
          options={ASSET_TYPES}
          selected={draft.assetTypes ?? []}
          onChange={(v) => set({ assetTypes: list(v) })}
        />
      </FilterSection>

      <FilterSection title="Owner" foldable count={draft.owners?.length}>
        <ToggleChips options={OWNERS} selected={draft.owners ?? []} onChange={(v) => set({ owners: list(v) })} />
      </FilterSection>

      <FilterSection title="Company size" foldable count={draft.marketCapTiers?.length}>
        <ToggleChips
          options={MARKET_CAPS}
          selected={draft.marketCapTiers ?? []}
          onChange={(v) => set({ marketCapTiers: list(v) })}
        />
      </FilterSection>

      <FilterSection title="Exact amount ranges" foldable count={draft.amountRanges?.length}>
        <ToggleChips
          options={AMOUNT_RANGES}
          selected={draft.amountRanges ?? []}
          onChange={(v) => set({ amountRanges: list(v) })}
        />
      </FilterSection>

      <FilterSection title="State" foldable count={draft.states?.length}>
        <ToggleChips options={US_STATES} selected={draft.states ?? []} onChange={(v) => set({ states: list(v) })} />
      </FilterSection>
    </>
  );
}

/**
 * A date filter: the past-N-days presets, and under them exact From and To
 * days for any other range. A preset sets From and clears To; picking a day
 * makes it exact dates, and the presets let go.
 */
function DateWindow({
  name,
  calendar,
  setCalendar,
  from,
  to,
  earliest,
  onChange,
}: {
  /** Which date filter this is, to tell its calendars from the other one's. */
  name: string;
  /** The calendar open in the sheet ("traded:from"), shared so only one is. */
  calendar: string | null;
  setCalendar: (key: string | null) => void;
  from: string | undefined;
  to: string | undefined;
  earliest: string;
  onChange: (from: string | undefined, to: string | undefined) => void;
}) {
  const { c } = useTheme();
  const editing: 'from' | 'to' | null =
    calendar === `${name}:from` ? 'from' : calendar === `${name}:to` ? 'to' : null;
  const setEditing = (which: 'from' | 'to' | null) => setCalendar(which ? `${name}:${which}` : null);
  const preset = windowFor(from, to);
  const today = todayIso();

  const field = (which: 'from' | 'to') => {
    const value = which === 'from' ? from : to;
    const on = editing === which;
    return (
      <Tap
        scaleTo={0.98}
        onPress={() => setEditing(on ? null : which)}
        accessibilityRole="button"
        accessibilityLabel={`${which === 'from' ? 'From' : 'To'} date, ${value ? shortDate(value) : which === 'from' ? 'any' : 'today'}`}
        style={[
          styles.dateField,
          { backgroundColor: c.surface, borderColor: on ? c.accent : c.border },
        ]}>
        <View style={styles.flex}>
          <Text variant="footnote" tone="muted">
            {which === 'from' ? 'From' : 'To'}
          </Text>
          <Text variant="bodyStrong" tone={value ? 'default' : 'faint'}>
            {value ? shortDate(value) : which === 'from' ? 'Any date' : 'Today'}
          </Text>
        </View>
        {value ? (
          <Tap
            hitSlop={10}
            accessibilityLabel={`Clear the ${which} date`}
            onPress={() => {
              setEditing(null);
              onChange(which === 'from' ? undefined : from, which === 'to' ? undefined : to);
            }}>
            <Icon name="close-circle" size={18} color={c.textFaint} />
          </Tap>
        ) : (
          <Icon name="calendar-outline" size={18} color={c.textFaint} />
        )}
      </Tap>
    );
  };

  return (
    <>
      <ToggleChips
        single
        options={WINDOWS.filter((w) => w.key !== 'any')}
        selected={preset === 'any' ? [] : [preset]}
        onChange={([v]) => {
          const w = WINDOWS.find((x) => x.key === v);
          setEditing(null);
          onChange(w && w.days ? daysAgo(w.days) : undefined, undefined);
        }}
      />
      <View style={styles.dateRow}>
        {field('from')}
        <Text variant="callout" tone="faint">
          –
        </Text>
        {field('to')}
      </View>
      {editing ? (
        // Fades in and out while the sections below slide (SECTION_MOTION),
        // rather than appearing and vanishing at full height in one frame.
        <Animated.View key={editing} entering={FadeIn.duration(220)} exiting={FadeOut.duration(140)}>
          <DayPicker
            value={editing === 'from' ? from : to}
            min={editing === 'from' ? earliest : (from ?? earliest)}
            max={editing === 'from' ? (to ?? today) : today}
            onPick={(day) => (editing === 'from' ? onChange(day, to) : onChange(from, day))}
            onClose={() => setEditing(null)}
          />
        </Animated.View>
      ) : null}
    </>
  );
}

const SECTION_MOTION = LinearTransition.duration(240);

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { paddingVertical: 20, borderBottomWidth: StyleSheet.hairlineWidth, gap: 14 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionBody: { gap: 10 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  input: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
  },
});
