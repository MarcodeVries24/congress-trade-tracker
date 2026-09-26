/**
 * The definition of a saved email alert: what a user can ask to be notified
 * about, how that turns into SQL, and how it reads back to them in English.
 *
 * This module is the single source of truth for all three, because it is
 * imported from *both* runtimes:
 *   - the web app (validating what the account screen saves, previewing how
 *     many trades a draft alert would have caught), and
 *   - `ingest/src/alerts/sendAlerts.ts` (the cron that actually matches new
 *     trades and emails them), via a relative path across the workspace.
 *
 * That's the whole point: an alert that *previewed* 12 matches must email
 * exactly those 12. Two hand-kept copies of this logic would drift, and the
 * failure mode — silently emailing the wrong trades, or silently emailing
 * none — is invisible until a paying user notices.
 *
 * So: no `next/*`, no React, no database client in here or in anything it
 * imports. Keep the imports below to dependency-free sibling modules.
 */
import { AMOUNT_RANGES, ASSET_TYPE_LABELS, ASSET_TYPE_VALUES, MARKET_CAP_TIERS, OWNER_LABELS } from "./api";
import { PLAUSIBLE_DATES_SQL, PUBLISHED_FILING_SQL } from "./sql";
import { memberDisplayNameFromFiledName } from "./memberDisplay";

export type AlertFrequency = "instant" | "daily" | "weekly";

export const ALERT_FREQUENCIES: { value: AlertFrequency; label: string; hint: string }[] = [
  // "Instant" is bounded by how often the ingest actually runs (every 4
  // hours — .github/workflows/ingest.yml), and that's the honest label:
  // there is no faster signal to forward, since the source disclosure sites
  // are only polled on that schedule.
  { value: "instant", label: "As it happens", hint: "Emailed on the next ingest run, at most 4 hours after a filing appears." },
  { value: "daily", label: "Daily digest", hint: "At most one email a day, bundling everything that matched." },
  { value: "weekly", label: "Weekly digest", hint: "At most one email a week. Nothing matched, nothing sent." },
];

/**
 * Every criterion an alert can carry. All optional, and all AND-ed together;
 * within one field the values are OR-ed (tickers: ["NVDA","TSLA"] means
 * either). An alert with no criteria at all matches every new trade — which
 * is a legitimate thing to want ("email me everything"), so it's allowed,
 * just described as "Every new trade" in the UI.
 */
export interface AlertFilters {
  /** Free text over member name, asset name and ticker — same as the site's search box. */
  q?: string;
  chambers?: string[];
  members?: string[];
  parties?: string[];
  /** Two-letter state/territory codes, matched against the member's state. */
  states?: string[];
  tickers?: string[];
  /** Canonical asset-type codes (ST, OP, …) — expanded to raw stored values via ASSET_TYPE_VALUES. */
  assetTypes?: string[];
  /** "P" | "S" | "E", matched as a prefix so "S" also covers "S (partial)". */
  types?: string[];
  owners?: string[];
  /** Matches when the disclosed bracket's floor is at least this much. */
  minAmount?: number;
  /** Exact disclosure brackets, for when a specific band is wanted rather than a floor. */
  amountRanges?: string[];
  marketCapTiers?: string[];
  filedStatus?: "late" | "onTime";
}

export const ALERT_CHAMBERS = [
  { value: "house", label: "House" },
  { value: "senate", label: "Senate" },
];

// Stored as the full word in members_reference/members_history (that's what
// the congress-legislators dataset uses), not as a one-letter code.
export const ALERT_PARTIES = [
  { value: "Democrat", label: "Democrat" },
  { value: "Republican", label: "Republican" },
  { value: "Independent", label: "Independent" },
];

export const ALERT_TRANSACTION_TYPES = [
  { value: "P", label: "Purchase" },
  { value: "S", label: "Sale" },
  { value: "E", label: "Exchange" },
];

/**
 * Trade-size floors offered as "at least" options. These are the *floors of
 * the disclosure brackets*, not round numbers, because that's the only
 * resolution the underlying data has: a PTR discloses a band ("$15,001 –
 * $50,000"), never an exact figure. Asking for "at least $10,000" would be
 * answerable only by guessing which side of $10k a $1,001–$15,000 trade fell
 * on, so the options are the real bracket edges instead.
 */
export const MIN_AMOUNT_OPTIONS = [
  { value: 1001, label: "$1,001+" },
  { value: 15001, label: "$15,001+" },
  { value: 50001, label: "$50,001+" },
  { value: 100001, label: "$100,001+" },
  { value: 250001, label: "$250,001+" },
  { value: 500001, label: "$500,001+" },
  { value: 1000001, label: "$1,000,001+" },
  { value: 5000001, label: "$5,000,001+" },
  { value: 25000001, label: "$25,000,001+" },
];

// State/territory codes as members_reference stores them. Alerts are the
// only place a user picks a state directly (the site's own filter goes
// through member names), so the list is spelled out rather than queried —
// it changes roughly never, and a dropdown that silently loses an option
// because nobody from that state has filed recently would be worse.
export const US_STATES: { value: string; label: string }[] = [
  ["AL", "Alabama"], ["AK", "Alaska"], ["AZ", "Arizona"], ["AR", "Arkansas"], ["CA", "California"],
  ["CO", "Colorado"], ["CT", "Connecticut"], ["DE", "Delaware"], ["DC", "District of Columbia"],
  ["FL", "Florida"], ["GA", "Georgia"], ["HI", "Hawaii"], ["ID", "Idaho"], ["IL", "Illinois"],
  ["IN", "Indiana"], ["IA", "Iowa"], ["KS", "Kansas"], ["KY", "Kentucky"], ["LA", "Louisiana"],
  ["ME", "Maine"], ["MD", "Maryland"], ["MA", "Massachusetts"], ["MI", "Michigan"], ["MN", "Minnesota"],
  ["MS", "Mississippi"], ["MO", "Missouri"], ["MT", "Montana"], ["NE", "Nebraska"], ["NV", "Nevada"],
  ["NH", "New Hampshire"], ["NJ", "New Jersey"], ["NM", "New Mexico"], ["NY", "New York"],
  ["NC", "North Carolina"], ["ND", "North Dakota"], ["OH", "Ohio"], ["OK", "Oklahoma"], ["OR", "Oregon"],
  ["PA", "Pennsylvania"], ["RI", "Rhode Island"], ["SC", "South Carolina"], ["SD", "South Dakota"],
  ["TN", "Tennessee"], ["TX", "Texas"], ["UT", "Utah"], ["VT", "Vermont"], ["VA", "Virginia"],
  ["WA", "Washington"], ["WV", "West Virginia"], ["WI", "Wisconsin"], ["WY", "Wyoming"],
  ["AS", "American Samoa"], ["GU", "Guam"], ["MP", "Northern Mariana Islands"], ["PR", "Puerto Rico"],
  ["VI", "U.S. Virgin Islands"],
].map(([value, label]) => ({ value, label }));

// Caps on list-valued criteria. Generous enough that nobody hits them by
// hand (there are ~550 members and a few thousand tickers), tight enough
// that a crafted request can't turn one saved alert into a 10,000-parameter
// query the cron then runs on every ingest.
const MAX_LIST_VALUES = 500;
const MAX_TEXT_LENGTH = 120;

function cleanList(input: unknown, allowed?: Set<string>, transform?: (s: string) => string): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const value = transform ? transform(raw.trim()) : raw.trim();
    if (!value || value.length > MAX_TEXT_LENGTH) continue;
    if (allowed && !allowed.has(value)) continue;
    seen.add(value);
    if (seen.size >= MAX_LIST_VALUES) break;
  }
  return seen.size ? [...seen] : undefined;
}

const CHAMBER_VALUES = new Set(ALERT_CHAMBERS.map((c) => c.value));
const PARTY_VALUES = new Set(ALERT_PARTIES.map((p) => p.value));
const STATE_VALUES = new Set(US_STATES.map((s) => s.value));
const TYPE_VALUES = new Set(ALERT_TRANSACTION_TYPES.map((t) => t.value));
const OWNER_VALUES = new Set(Object.keys(OWNER_LABELS));
const ASSET_TYPE_CODES = new Set(Object.keys(ASSET_TYPE_LABELS));
const AMOUNT_RANGE_VALUES = new Set(AMOUNT_RANGES);
const MARKET_CAP_VALUES = new Set(MARKET_CAP_TIERS.map((t) => t.value));
const MIN_AMOUNT_VALUES = new Set(MIN_AMOUNT_OPTIONS.map((o) => o.value));

/**
 * Whitelists a filter object that arrived over the wire.
 *
 * This is a security boundary, not a convenience: the result is stored as
 * JSON and later fed back into a query builder by a *cron job running
 * unattended*, so anything unrecognized is dropped rather than passed
 * through. Every value that reaches SQL is still a bound parameter as well —
 * this is the belt to that suspenders.
 */
export function normalizeAlertFilters(input: unknown): AlertFilters {
  const raw = (input ?? {}) as Record<string, unknown>;
  const filters: AlertFilters = {};

  if (typeof raw.q === "string" && raw.q.trim()) filters.q = raw.q.trim().slice(0, MAX_TEXT_LENGTH);

  const chambers = cleanList(raw.chambers, CHAMBER_VALUES);
  // Selecting both chambers is the same as selecting neither; storing it as
  // "no criterion" keeps the description short and the query one clause
  // lighter.
  if (chambers && chambers.length < CHAMBER_VALUES.size) filters.chambers = chambers;

  const members = cleanList(raw.members);
  if (members) filters.members = members;

  const parties = cleanList(raw.parties, PARTY_VALUES);
  if (parties && parties.length < PARTY_VALUES.size) filters.parties = parties;

  const states = cleanList(raw.states, STATE_VALUES, (s) => s.toUpperCase());
  if (states) filters.states = states;

  const tickers = cleanList(raw.tickers, undefined, (s) => s.toUpperCase());
  if (tickers) filters.tickers = tickers;

  const assetTypes = cleanList(raw.assetTypes, ASSET_TYPE_CODES);
  if (assetTypes && assetTypes.length < ASSET_TYPE_CODES.size) filters.assetTypes = assetTypes;

  const types = cleanList(raw.types, TYPE_VALUES);
  if (types && types.length < TYPE_VALUES.size) filters.types = types;

  const owners = cleanList(raw.owners, OWNER_VALUES);
  if (owners && owners.length < OWNER_VALUES.size) filters.owners = owners;

  if (typeof raw.minAmount === "number" && MIN_AMOUNT_VALUES.has(raw.minAmount)) filters.minAmount = raw.minAmount;

  const amountRanges = cleanList(raw.amountRanges, AMOUNT_RANGE_VALUES);
  if (amountRanges && amountRanges.length < AMOUNT_RANGE_VALUES.size) filters.amountRanges = amountRanges;

  const marketCapTiers = cleanList(raw.marketCapTiers, MARKET_CAP_VALUES);
  if (marketCapTiers && marketCapTiers.length < MARKET_CAP_VALUES.size) filters.marketCapTiers = marketCapTiers;

  if (raw.filedStatus === "late" || raw.filedStatus === "onTime") filters.filedStatus = raw.filedStatus;

  return filters;
}

/**
 * The FROM/JOIN block every alert query runs against. Identical to the one
 * /api/trades uses, including the two-hop market-cap resolution (most House
 * OCR rows carry an asset name but no ticker — asset_name_tickers resolves
 * those once so they can still match a cap tier).
 */
export const ALERT_FROM_SQL = `
  FROM transactions t
  JOIN filings f ON f.doc_id = t.doc_id
  LEFT JOIN members_reference mr ON mr.state_district = t.state_district
  LEFT JOIN members_history mh ON mh.bioguide_id = f.bioguide_id
  LEFT JOIN asset_name_tickers ant ON (t.ticker IS NULL OR t.ticker = '') AND ant.asset_name = t.asset_name
  LEFT JOIN company_market_caps cmc ON cmc.ticker = COALESCE(NULLIF(t.ticker, ''), ant.ticker)`;

/** The party/state expressions, which need the COALESCE over both member tables. */
const PARTY_EXPR = `COALESCE(mh.party, mr.party)`;
const STATE_EXPR = `COALESCE(mh.state, mr.state)`;

/**
 * Turns a stored alert into SQL conditions.
 *
 * `addParam` must push the value onto the caller's parameter array and
 * return its `$n` placeholder — the same pattern /api/trades uses, so the
 * caller stays in control of parameter numbering and nothing is ever
 * interpolated into the SQL string.
 *
 * Always includes the site's own two baseline conditions (published filings
 * only, and no impossible transaction dates), so an alert can never notify
 * about a row a visitor couldn't then go and look at.
 */
export function buildAlertConditions(filters: AlertFilters, addParam: (value: unknown) => string): string[] {
  const conditions: string[] = [PLAUSIBLE_DATES_SQL, PUBLISHED_FILING_SQL];

  if (filters.q) {
    const p = addParam(`%${filters.q}%`);
    conditions.push(`(t.member_name ILIKE ${p} OR t.asset_name ILIKE ${p} OR t.ticker ILIKE ${p})`);
  }
  if (filters.chambers?.length) conditions.push(`f.chamber = ANY(${addParam(filters.chambers)})`);
  if (filters.members?.length) conditions.push(`t.member_name = ANY(${addParam(filters.members)})`);
  if (filters.parties?.length) conditions.push(`${PARTY_EXPR} = ANY(${addParam(filters.parties)})`);
  if (filters.states?.length) conditions.push(`${STATE_EXPR} = ANY(${addParam(filters.states)})`);
  if (filters.tickers?.length) conditions.push(`t.ticker = ANY(${addParam(filters.tickers)})`);
  if (filters.assetTypes?.length) {
    // One canonical code covers several raw stored values — the House stores
    // its own short code ("ST"), the Senate stores free text ("Stock").
    const rawValues = filters.assetTypes.flatMap((code) => ASSET_TYPE_VALUES[code] ?? [code]);
    conditions.push(`t.asset_type_code = ANY(${addParam(rawValues)})`);
  }
  if (filters.types?.length) {
    // Prefix match: the stored type can be "S (partial)" as well as "S".
    conditions.push(`(${filters.types.map((t) => `t.transaction_type ILIKE ${addParam(`${t}%`)}`).join(" OR ")})`);
  }
  if (filters.owners?.length) {
    // "self" is stored as NULL, not as a code.
    conditions.push(`(${filters.owners.map((o) => (o === "self" ? `t.owner IS NULL` : `t.owner = ${addParam(o)}`)).join(" OR ")})`);
  }
  if (filters.minAmount) conditions.push(`t.amount_low >= ${addParam(filters.minAmount)}`);
  if (filters.amountRanges?.length) conditions.push(`t.amount_range = ANY(${addParam(filters.amountRanges)})`);
  if (filters.marketCapTiers?.length) {
    const tierConditions = filters.marketCapTiers
      .map((value) => MARKET_CAP_TIERS.find((t) => t.value === value))
      .filter((t): t is (typeof MARKET_CAP_TIERS)[number] => t !== undefined)
      .map((tier) => {
        if (tier.value === "undefined") return `cmc.market_cap IS NULL`;
        const parts: string[] = [];
        if (tier.min !== null) parts.push(`cmc.market_cap >= ${addParam(tier.min)}`);
        if (tier.max !== null) parts.push(`cmc.market_cap < ${addParam(tier.max)}`);
        return `(${parts.join(" AND ")})`;
      });
    if (tierConditions.length) conditions.push(`(${tierConditions.join(" OR ")})`);
  }
  // STOCK Act requires filing within 45 days of the transaction.
  if (filters.filedStatus === "late") {
    conditions.push(`(NULLIF(f.filing_date, '')::date - NULLIF(t.transaction_date, '')::date) > 45`);
  } else if (filters.filedStatus === "onTime") {
    conditions.push(`(NULLIF(f.filing_date, '')::date - NULLIF(t.transaction_date, '')::date) <= 45`);
  }

  return conditions;
}

/** "NVDA, TSLA, AAPL +4" — a capped, readable join for a chip. */
function joinCapped(values: string[], max: number): string {
  const shown = values.slice(0, max).join(", ");
  return values.length <= max ? shown : `${shown} +${values.length - max}`;
}

/**
 * The alert's criteria as short chips — "House", "Purchases", "$50,001+".
 * Used verbatim in the account screen and again in the email itself, so a
 * recipient can always see *why* a trade reached them without opening the
 * site.
 */
export function describeAlert(filters: AlertFilters): string[] {
  const chips: string[] = [];

  if (filters.chambers?.length) {
    chips.push(filters.chambers.map((c) => (c === "house" ? "House" : "Senate")).join(" or "));
  }
  if (filters.parties?.length) chips.push(filters.parties.map((p) => `${p}s`).join(" or "));
  if (filters.states?.length) chips.push(joinCapped(filters.states, 4));
  if (filters.members?.length) chips.push(joinCapped(filters.members.map(memberDisplayNameFromFiledName), 2));
  if (filters.types?.length) {
    chips.push(filters.types.map((t) => ({ P: "Purchases", S: "Sales", E: "Exchanges" })[t] ?? t).join(" or "));
  }
  if (filters.tickers?.length) chips.push(joinCapped(filters.tickers, 4));
  if (filters.assetTypes?.length) chips.push(filters.assetTypes.map((c) => ASSET_TYPE_LABELS[c] ?? c).join(", "));
  if (filters.owners?.length) chips.push(filters.owners.map((o) => OWNER_LABELS[o] ?? o).join(" or "));
  if (filters.minAmount) chips.push(MIN_AMOUNT_OPTIONS.find((o) => o.value === filters.minAmount)?.label ?? `$${filters.minAmount}+`);
  if (filters.amountRanges?.length) chips.push(joinCapped(filters.amountRanges, 2));
  if (filters.marketCapTiers?.length) {
    chips.push(filters.marketCapTiers.map((v) => MARKET_CAP_TIERS.find((t) => t.value === v)?.label.replace(/\s*\(.+\)$/, "") ?? v).join(", "));
  }
  if (filters.filedStatus === "late") chips.push("Filed late (>45 days)");
  if (filters.filedStatus === "onTime") chips.push("Filed on time (\u2264 45 days)");
  if (filters.q) chips.push(`\u201C${filters.q}\u201D`);

  return chips.length ? chips : ["Every new trade"];
}

/** One-line version of the above, for an email subject or a list row. */
export function summarizeAlert(filters: AlertFilters): string {
  return describeAlert(filters).join(" · ");
}

/**
 * The columns an alert's matches are read with — enough to render an email
 * row (or a preview row) without a second query.
 */
export const ALERT_SELECT_SQL = `t.id, t.doc_id, t.member_name, f.bioguide_id, t.state_district, t.asset_name, t.ticker,
  t.asset_type_code, t.owner, t.transaction_type, t.transaction_date, t.amount_range, t.amount_low,
  t.amount_high, f.filing_date, f.pdf_url, f.chamber, f.ingested_at,
  COALESCE(mh.party, mr.party) AS party,
  COALESCE(mh.state, mr.state) AS member_state,
  cmc.market_cap,
  cmc.company_name`;

export interface AlertTradeRow {
  id: number;
  doc_id: string;
  member_name: string;
  bioguide_id: string | null;
  state_district: string | null;
  asset_name: string;
  ticker: string | null;
  asset_type_code: string | null;
  owner: string | null;
  transaction_type: string;
  transaction_date: string | null;
  amount_range: string | null;
  amount_low: number | null;
  amount_high: number | null;
  filing_date: string | null;
  pdf_url: string;
  chamber: "house" | "senate";
  ingested_at: string;
  party: string | null;
  member_state: string | null;
  market_cap: number | null;
  company_name: string | null;
}

/**
 * Identifies a trade by what it *says*, not by its row id.
 *
 * transactions.id is not stable: re-ingesting a filing deletes and reinserts
 * all of its rows, and so does a hand-verified rewrite. An id-keyed ledger
 * would therefore re-send a member's whole filing every time its parse got
 * better — the most visible possible bug in a notification product. This
 * hash survives both, because the underlying document didn't change.
 *
 * Paired with an occurrence number by the caller (see sendAlerts.ts) so that
 * two genuinely identical lines in one filing stay two distinct matches.
 */
export const ALERT_CONTENT_KEY_SQL = `md5(
    t.doc_id || '|' || COALESCE(t.ticker, '') || '|' || t.asset_name || '|' ||
    t.transaction_type || '|' || COALESCE(t.transaction_date, '') || '|' ||
    COALESCE(t.amount_range, '') || '|' || COALESCE(t.owner, '')
  )`;
