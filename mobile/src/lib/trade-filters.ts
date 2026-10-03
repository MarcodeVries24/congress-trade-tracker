import type { AlertFilters, TradeQuery } from '@/lib/api';
import { memberDisplayNameFromFiledName } from '@/lib/format';

/**
 * Every filter the trades page offers, as one object.
 *
 * It is the website's trade query less paging, and it is also, bar the dates
 * and the sort, exactly an alert: the server builds both queries with the same
 * function, so a filter set here and saved as an alert emails precisely the
 * trades this page shows.
 */
export type TradeFilters = Omit<TradeQuery, 'page' | 'limit'>;

// The option lists below repeat the website's (web/lib/api.ts and
// web/lib/alertFilters.ts), because the server whitelists values against
// those lists and drops anything else. Change one, change both.

export const SORTS = [
  { key: 'filing_date', label: 'Newest filed', order: 'desc' },
  { key: 'transaction_date', label: 'Newest traded', order: 'desc' },
  { key: 'amount_low', label: 'Largest amount', order: 'desc' },
  { key: 'days_to_file', label: 'Slowest to disclose', order: 'desc' },
  { key: 'market_cap', label: 'Largest company', order: 'desc' },
  { key: 'member_name', label: 'Member A–Z', order: 'asc' },
  { key: 'ticker', label: 'Ticker A–Z', order: 'asc' },
] as const;

export const CHAMBERS = [
  { key: 'house', label: 'House' },
  { key: 'senate', label: 'Senate' },
] as const;

export const TYPES = [
  { key: 'P', label: 'Purchases' },
  { key: 'S', label: 'Sales' },
  { key: 'E', label: 'Exchanges' },
] as const;

export const PARTIES = [
  { key: 'Democrat', label: 'Democrat' },
  { key: 'Republican', label: 'Republican' },
  { key: 'Independent', label: 'Independent' },
] as const;

export const OWNERS = [
  { key: 'self', label: 'Self' },
  { key: 'SP', label: 'Spouse' },
  { key: 'JT', label: 'Joint' },
  { key: 'DC', label: 'Dependent child' },
] as const;

export const MIN_AMOUNTS = [
  { key: '1001', label: '$1K+' },
  { key: '15001', label: '$15K+' },
  { key: '50001', label: '$50K+' },
  { key: '100001', label: '$100K+' },
  { key: '250001', label: '$250K+' },
  { key: '500001', label: '$500K+' },
  { key: '1000001', label: '$1M+' },
  { key: '5000001', label: '$5M+' },
] as const;

export const AMOUNT_RANGES = [
  '$1,000 or less',
  '$1,001 - $15,000',
  '$15,001 - $50,000',
  '$50,001 - $100,000',
  '$100,001 - $250,000',
  '$250,001 - $500,000',
  '$500,001 - $1,000,000',
  '$1,000,001 - $5,000,000',
  '$5,000,001 - $25,000,000',
  '$25,000,001 - $50,000,000',
].map((r) => ({ key: r, label: r.replace(/\s*-\s*/, ' – ') }));

export const ASSET_TYPES = [
  { key: 'ST', label: 'Stock' },
  { key: 'OP', label: 'Option' },
  { key: 'PS', label: 'Preferred stock' },
  { key: 'RS', label: 'Restricted stock unit' },
  { key: 'CS', label: 'Corporate security' },
  { key: 'GS', label: 'Government security' },
  { key: 'CT', label: 'Crypto' },
  { key: 'AB', label: 'Asset-backed' },
  { key: 'OI', label: 'Investment fund' },
  { key: 'HN', label: 'Hedge fund' },
  { key: 'OL', label: 'LLC / LLP interest' },
  { key: 'VA', label: 'Variable annuity' },
  { key: 'OT', label: 'Other securities' },
] as const;

export const MARKET_CAPS = [
  { key: 'mega', label: 'Mega (≥$200B)' },
  { key: 'large', label: 'Large ($10B–$200B)' },
  { key: 'mid', label: 'Mid ($2B–$10B)' },
  { key: 'small', label: 'Small ($300M–$2B)' },
  { key: 'micro', label: 'Micro ($50M–$300M)' },
  { key: 'nano', label: 'Nano (<$50M)' },
] as const;

export const FILED = [
  { key: 'any', label: 'Any' },
  { key: 'late', label: 'Filed late (>45 days)' },
  { key: 'onTime', label: 'On time' },
] as const;

/** Filing-date windows. Presets rather than a calendar: they are what people pick. */
export const WINDOWS = [
  { key: 'any', label: 'Any time', days: 0 },
  { key: '7', label: 'Past week', days: 7 },
  { key: '30', label: 'Past 30 days', days: 30 },
  { key: '90', label: 'Past 90 days', days: 90 },
  { key: '365', label: 'Past year', days: 365 },
] as const;

export const US_STATES = [
  'AL',
  'AK',
  'AZ',
  'AR',
  'CA',
  'CO',
  'CT',
  'DE',
  'DC',
  'FL',
  'GA',
  'HI',
  'ID',
  'IL',
  'IN',
  'IA',
  'KS',
  'KY',
  'LA',
  'ME',
  'MD',
  'MA',
  'MI',
  'MN',
  'MS',
  'MO',
  'MT',
  'NE',
  'NV',
  'NH',
  'NJ',
  'NM',
  'NY',
  'NC',
  'ND',
  'OH',
  'OK',
  'OR',
  'PA',
  'RI',
  'SC',
  'SD',
  'TN',
  'TX',
  'UT',
  'VT',
  'VA',
  'WA',
  'WV',
  'WI',
  'WY',
  'AS',
  'GU',
  'MP',
  'PR',
  'VI',
].map((s) => ({ key: s, label: s }));

/** YYYY-MM-DD for a day `days` before today, the form the route compares against. */
export function daysAgo(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

/** Which window preset a dateFrom corresponds to, if any. */
export function windowFor(dateFrom: string | undefined): string {
  if (!dateFrom) return 'any';
  const days = Math.round((Date.now() - new Date(`${dateFrom}T00:00:00Z`).getTime()) / 86_400_000);
  return WINDOWS.find((w) => w.days && Math.abs(w.days - days) <= 1)?.key ?? 'any';
}

const LIST_KEYS = [
  'chamber',
  'types',
  'parties',
  'members',
  'tickers',
  'states',
  'owners',
  'assetTypes',
  'amountRanges',
  'marketCapTiers',
] as const;

/** How many filters are set, for the badge on the Filters button. Sort does not count. */
export function countActive(f: TradeFilters): number {
  let n = 0;
  for (const key of LIST_KEYS) if (f[key]?.length) n += 1;
  if (f.minAmount) n += 1;
  if (f.filedStatus) n += 1;
  if (f.dateFrom || f.dateTo) n += 1;
  return n;
}

export type ActiveChip = { key: string; label: string; clear: (f: TradeFilters) => TradeFilters };

const labelOf = (list: readonly { key: string; label: string }[], key: string) =>
  list.find((o) => o.key === key)?.label ?? key;

function joined(values: string[], max = 2): string {
  return values.length <= max ? values.join(', ') : `${values.slice(0, max).join(', ')} +${values.length - max}`;
}

/**
 * The active filters as removable chips under the search bar, the way Airbnb
 * shows "2 guests · Pets" above results. Each one knows how to remove itself.
 */
export function activeChips(f: TradeFilters): ActiveChip[] {
  const chips: ActiveChip[] = [];
  const drop = (key: keyof TradeFilters) => (x: TradeFilters) => {
    const next = { ...x };
    delete next[key];
    return next;
  };
  if (f.q) chips.push({ key: 'q', label: `“${f.q}”`, clear: drop('q') });
  if (f.chamber?.length)
    chips.push({ key: 'chamber', label: joined(f.chamber.map((c) => labelOf(CHAMBERS, c))), clear: drop('chamber') });
  if (f.types?.length)
    chips.push({ key: 'types', label: joined(f.types.map((t) => labelOf(TYPES, t))), clear: drop('types') });
  if (f.members?.length) {
    const names = [...new Set(f.members.map(memberDisplayNameFromFiledName))];
    chips.push({ key: 'members', label: joined(names, 1), clear: drop('members') });
  }
  if (f.tickers?.length) chips.push({ key: 'tickers', label: joined(f.tickers, 3), clear: drop('tickers') });
  if (f.parties?.length)
    chips.push({ key: 'parties', label: joined(f.parties.map((p) => `${p}s`)), clear: drop('parties') });
  if (f.states?.length) chips.push({ key: 'states', label: joined(f.states, 4), clear: drop('states') });
  if (f.minAmount)
    chips.push({ key: 'minAmount', label: labelOf(MIN_AMOUNTS, String(f.minAmount)), clear: drop('minAmount') });
  if (f.amountRanges?.length)
    chips.push({
      key: 'amountRanges',
      label: joined(
        f.amountRanges.map((r) => labelOf(AMOUNT_RANGES, r)),
        1
      ),
      clear: drop('amountRanges'),
    });
  if (f.assetTypes?.length)
    chips.push({
      key: 'assetTypes',
      label: joined(f.assetTypes.map((a) => labelOf(ASSET_TYPES, a))),
      clear: drop('assetTypes'),
    });
  if (f.owners?.length)
    chips.push({ key: 'owners', label: joined(f.owners.map((o) => labelOf(OWNERS, o))), clear: drop('owners') });
  if (f.marketCapTiers?.length) {
    chips.push({
      key: 'marketCapTiers',
      label: joined(f.marketCapTiers.map((m) => labelOf(MARKET_CAPS, m).replace(/\s*\(.+\)$/, ' cap'))),
      clear: drop('marketCapTiers'),
    });
  }
  if (f.filedStatus)
    chips.push({ key: 'filedStatus', label: labelOf(FILED, f.filedStatus), clear: drop('filedStatus') });
  if (f.dateFrom) {
    chips.push({
      key: 'dateFrom',
      label: `Filed ${labelOf(WINDOWS, windowFor(f.dateFrom)).toLowerCase()}`,
      clear: (x) => {
        const next = { ...x };
        delete next.dateFrom;
        delete next.dateTo;
        return next;
      },
    });
  }
  return chips;
}

/**
 * The same filters as an alert. Dates and sort have no meaning for an alert,
 * which only ever looks at filings that arrive after it is saved.
 */
export function toAlertFilters(f: TradeFilters): AlertFilters {
  return {
    q: f.q || undefined,
    chambers: f.chamber?.length ? [...f.chamber] : undefined,
    members: f.members,
    parties: f.parties,
    states: f.states,
    tickers: f.tickers,
    assetTypes: f.assetTypes,
    types: f.types,
    owners: f.owners,
    minAmount: f.minAmount,
    amountRanges: f.amountRanges,
    marketCapTiers: f.marketCapTiers,
    filedStatus: f.filedStatus,
  };
}

/** An alert's filters as a trades search, for opening "what this alert matches". */
export function fromAlertFilters(a: AlertFilters): TradeFilters {
  const chamber = (a.chambers ?? []).filter((c): c is 'house' | 'senate' => c === 'house' || c === 'senate');
  return {
    q: a.q || undefined,
    chamber: chamber.length ? chamber : undefined,
    members: a.members,
    parties: a.parties,
    states: a.states,
    tickers: a.tickers,
    assetTypes: a.assetTypes,
    types: a.types,
    owners: a.owners,
    minAmount: a.minAmount,
    amountRanges: a.amountRanges,
    marketCapTiers: a.marketCapTiers,
    filedStatus: a.filedStatus,
  };
}

/** A name for the alert these filters would make, for the editor to start from. */
export function suggestAlertName(f: TradeFilters): string {
  const chips = activeChips(f).filter((c) => c.key !== 'dateFrom');
  if (!chips.length) return f.q ? `Trades matching "${f.q}"` : 'Every new trade';
  return chips
    .slice(0, 3)
    .map((c) => c.label)
    .join(' · ');
}
