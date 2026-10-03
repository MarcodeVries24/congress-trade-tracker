import { useState, type ReactNode } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { memberDisplayNameFromFiledName } from '@/lib/format';
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
  daysAgo,
  windowFor,
  type TradeFilters,
} from '@/lib/trade-filters';
import { radius, useTheme } from '@/theme';
import { Icon } from '@/ui/icon';
import { MemberPicker } from '@/ui/member-picker';
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

/** Ticker text as typed ("nvda, tsla") to the list the filters carry. */
export function parseTickers(text: string): string[] | undefined {
  const tickers = text
    .split(/[\s,]+/)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);
  return tickers.length ? tickers : undefined;
}

/**
 * Every filter the website has, as sections: the Trades tab's filter sheet
 * and the alert editor both draw these, so an alert can be exactly any search.
 *
 * `mode` drops what has no meaning for an alert (sort, and the filed-in-the-
 * last-N-days window: an alert only ever sees filings that arrive after it is
 * saved) and adds the keyword, which a search takes from its search bar.
 * Tickers are typed as text and kept by the caller, so a half-typed one is
 * not split up while typing.
 */
export function FilterFields({
  draft,
  set,
  tickerText,
  setTickerText,
  mode,
}: {
  draft: TradeFilters;
  set: (patch: Partial<TradeFilters>) => void;
  tickerText: string;
  setTickerText: (text: string) => void;
  mode: 'search' | 'alert';
}) {
  const { c } = useTheme();
  const list = (values: string[]) => (values.length ? values : undefined);
  const input = [styles.input, { backgroundColor: c.surface, borderColor: c.border, color: c.text }];
  const sort = SORTS.find((s) => s.key === draft.sort) ?? SORTS[0];
  const window = windowFor(draft.dateFrom);

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

      <FilterSection title="Tickers" hint="Separate with commas">
        <TextInput
          value={tickerText}
          onChangeText={setTickerText}
          placeholder="e.g. NVDA, TSLA"
          placeholderTextColor={c.textFaint}
          autoCapitalize="characters"
          autoCorrect={false}
          style={input}
        />
      </FilterSection>

      <FilterSection title="Minimum amount" hint="The lowest value of the disclosed range">
        <ToggleChips
          single
          options={MIN_AMOUNTS}
          selected={draft.minAmount ? [String(draft.minAmount)] : []}
          onChange={([v]) => set({ minAmount: v ? Number(v) : undefined })}
        />
      </FilterSection>

      {mode === 'search' ? (
        <FilterSection title="Filed" hint="By the date the disclosure was published">
          <ToggleChips
            single
            options={WINDOWS.filter((w) => w.key !== 'any')}
            selected={window === 'any' ? [] : [window]}
            onChange={([v]) => {
              const w = WINDOWS.find((x) => x.key === v);
              set({ dateFrom: w && w.days ? daysAgo(w.days) : undefined, dateTo: undefined });
            }}
          />
        </FilterSection>
      ) : null}

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

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
});
