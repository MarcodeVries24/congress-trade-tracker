import { fetchPolitician, fetchTrades, type Trade } from '@/lib/api';
import { amountLabel, assetLabel, compactUSD, memberName } from '@/lib/format';
import { memberSlug } from '@/lib/member-slug';

/**
 * Real trades shown as examples before someone has Pro: the three biggest
 * recent ones on the welcome screen, and the one an alert would announce on
 * the plans screen. Always trades as filed, never made up: they carry real
 * members' names.
 */

export type Example = {
  key: string;
  name: string;
  party: string | null;
  photo: string | null;
  ticker: string;
  company: string;
  verb: string;
  amount: string;
  traded: string | null;
};

/** What an example is made from: a feed trade, or a member page's trade with the member's profile. */
type ExampleSource = Pick<
  Trade,
  | 'id'
  | 'member_name'
  | 'party'
  | 'photo_url'
  | 'ticker'
  | 'asset_name'
  | 'company_name'
  | 'transaction_type'
  | 'amount_low'
  | 'amount_high'
  | 'amount_range'
  | 'transaction_date'
>;

/** A trade as an example row: who, bought or sold what, how much, when. */
function toExample(t: ExampleSource): Example {
  return {
    key: String(t.id),
    name: memberName(t),
    party: t.party,
    photo: t.photo_url,
    ticker: t.ticker!,
    company: assetLabel(t),
    // "Sold part of" costs the company name its room in a short row.
    verb: /^P/i.test(t.transaction_type) ? 'Bought' : 'Sold',
    amount:
      t.amount_low && t.amount_high
        ? `${compactUSD(t.amount_low)} – ${compactUSD(t.amount_high)}`
        : amountLabel(t.amount_range),
    traded: t.transaction_date,
  };
}

// Picked members whose pages are asked for their trades, at most: one request each.
const MEMBERS_ASKED = 5;
// The newest filings by anyone, when nobody was picked or they have no stock trades.
const LATEST_ASKED = 40;

// The fields fromLatestFiling reads, on a feed trade and on a member page's trade alike.
type Dated = {
  ticker: string | null;
  transaction_type: string;
  company_name?: string | null;
  amount_low: number | null;
  filing_date: string | null;
};

const isStockBuyOrSale = (t: Dated & { asset_type_code?: string | null }) =>
  !!t.ticker && /^[PS]/i.test(t.transaction_type) && (t.asset_type_code ?? 'ST') === 'ST';

/**
 * The trade to show from the newest filing among these: the latest filed,
 * and within that filing, one with a company the SEC names rather than a raw
 * filed asset name (which can be long and in capitals, "PT BANK CENTRAL ASIA
 * TBK UNSPONSORED ADR"), the biggest first.
 */
function fromLatestFiling<T extends Dated>(trades: T[]): T | undefined {
  const newest = trades.reduce((max, t) => ((t.filing_date ?? '') > max ? (t.filing_date ?? '') : max), '');
  return trades
    .filter((t) => (t.filing_date ?? '') === newest)
    .sort(
      (a, b) =>
        Number(Boolean(b.company_name)) - Number(Boolean(a.company_name)) || (b.amount_low ?? 0) - (a.amount_low ?? 0)
    )[0];
}

/** The plans screen's example alert, and what to call it above the card. */
export type AlertExample = { example: Example; label: 'Latest trade' | 'From a filing' };

/**
 * The trade the plans screen shows as an example alert, always a real one,
 * from the latest filing:
 *
 * 1. of someone picked during setup, so the example is about them;
 * 2. else of anyone;
 * 3. else, offline, a well-known filed one, labelled as such.
 *
 * Picked members come from their pages' free endpoint: a member filter on
 * /api/trades is a Pro filter, and nobody on the plans screen has Pro.
 */
export async function fetchAlertExample(filedNames: string[], signal?: AbortSignal): Promise<AlertExample> {
  const slugs = [...new Set(filedNames.map(memberSlug))].slice(0, MEMBERS_ASKED);
  const pages = await Promise.all(slugs.map((slug) => fetchPolitician(slug, { signal }).catch(() => null)));
  const theirs = fromLatestFiling(
    pages.flatMap((page) =>
      page
        ? page.trades
            .filter(isStockBuyOrSale)
            .map((t) => ({
              ...t,
              member_name: page.profile.display,
              party: page.profile.party,
              photo_url: page.profile.photo_url,
            }))
        : []
    )
  );
  if (theirs) return { example: toExample(theirs), label: 'Latest trade' };
  try {
    const res = await fetchTrades({ limit: LATEST_ASKED, assetTypes: ['ST'] }, { signal });
    const anyone = fromLatestFiling(res.data.filter((t) => isStockBuyOrSale(t) && t.photo_url));
    if (anyone) return { example: toExample(anyone), label: 'Latest trade' };
  } catch (e) {
    if (signal?.aborted) throw e;
  }
  return { example: FALLBACK[0], label: 'From a filing' };
}

// How many of the latest filings to look through for the biggest: the 200
// newest stock trades are about the last couple of weeks of disclosures.
export const RECENT = 200;
// Purchases and sales made this recently; exchanges are left out, as share
// swaps say little on their own.
const TRADED_WITHIN_DAYS = 90;

/**
 * The biggest recent stock trades, one per member, from the newest filings:
 * the largest disclosed brackets first, among purchases and sales made in the
 * last 90 days that have a ticker and a photo of who made them. Worked out
 * here from the free feed, since sorting by size within a date window is a
 * Pro filter on the API.
 */
export function biggestRecent(trades: Trade[]): Example[] {
  const seen = new Set<string>();
  // Traded in the last 90 days, not only filed in them: a late filing of a
  // year-old trade is not "recent" to anyone reading it.
  const since = new Date(Date.now() - TRADED_WITHIN_DAYS * 86_400_000).toISOString().slice(0, 10);
  return trades
    .filter((t) => t.ticker && t.photo_url && t.amount_low)
    .filter((t) => /^[PS]/i.test(t.transaction_type) && (t.transaction_date ?? '') >= since)
    .sort(
      (a, b) => (b.amount_low ?? 0) - (a.amount_low ?? 0) || (b.filing_date ?? '').localeCompare(a.filing_date ?? '')
    )
    .filter((t) => {
      const who = t.member_slug ?? t.member_name;
      if (seen.has(who)) return false;
      seen.add(who);
      return true;
    })
    .slice(0, 3)
    .map(toExample);
}

/**
 * Three well-known real trades, as filed, for when the recent ones cannot be
 * loaded (offline on first launch): the screen should never show an empty
 * card.
 */
export const FALLBACK: Example[] = [
  {
    key: 'pelosi-nvda',
    name: 'Nancy Pelosi',
    party: 'Democrat',
    photo: 'https://bioguide.congress.gov/bioguide/photo/P/P000197.jpg',
    ticker: 'NVDA',
    company: 'NVIDIA',
    verb: 'Bought',
    amount: '$1M – $5M',
    traded: '2024-07-26',
  },
  {
    key: 'tuberville-intc',
    name: 'Tommy Tuberville',
    party: 'Republican',
    photo: 'https://bioguide.congress.gov/bioguide/photo/T/T000278.jpg',
    ticker: 'INTC',
    company: 'Intel',
    verb: 'Bought',
    amount: '$100K – $250K',
    traded: '2024-05-08',
  },
  {
    key: 'greene-unh',
    name: 'Marjorie Taylor Greene',
    party: 'Republican',
    photo: 'https://bioguide.congress.gov/bioguide/photo/G/G000596.jpg',
    ticker: 'UNH',
    company: 'UnitedHealth',
    verb: 'Bought',
    amount: '$15K – $50K',
    traded: '2025-05-14',
  },
];
