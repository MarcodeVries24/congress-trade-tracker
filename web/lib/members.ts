import { sql } from "./db";
import { PUBLISHED_FILING_SQL } from "./sql";
import { displayName } from "./api";
import { memberSlug } from "./memberSlug";
import { MEMBER_DISPLAY_NAMES } from "./memberNames";

// Re-exported so server code has one import for everything member-related.
export { memberSlug };

/**
 * Per-member pages, keyed by a slug derived from the disclosed name.
 *
 * The slug is the URL: /politicians/nancy-pelosi. Nothing maintains a list —
 * a member who has never traded before simply starts resolving the moment
 * their first filing is published, because every lookup here is a query.
 */

export interface MemberDirectoryEntry {
  /** Stable identity: the bioguide id, or a name key for the rare filing without one. */
  key: string;
  bioguideId: string | null;
  slug: string;
  /**
   * Every stored spelling of this person's name.
   *
   * The disclosure sites are not consistent: the corpus holds Marjorie Taylor
   * Greene as both "Marjorie Taylor Greene" and "Marjorie Taylor Mrs Greene",
   * Scott Franklin four different ways, and Thomas Kean three. Grouping on the
   * name — or even on a slug of it — leaves those as separate people with
   * their trades divided between them.
   */
  names: string[];
  display: string;
  /** The name the filings alone imply, before any curated override. */
  derivedDisplay: string;
  trades: number;
}

// Tokens that are form-filling noise rather than part of a name: honorifics
// and post-nominals that appear in some spellings and not others.
const NAME_NOISE = /\b(mr|mrs|ms|dr|hon|md|facs|dds|esq)\b/i;

/**
 * Title-cases a name that only ever appears in capitals.
 *
 * Two members — Blumenthal and Feinstein — are filed exclusively as
 * "RICHARD BLUMENTHAL" and "DIANNE FEINSTEIN", so there is no better-cased
 * variant to prefer and shouting them in an <h1> is the only alternative.
 * Applied only when the name carries no case information at all, so a
 * correctly-cased "McCaul" or "DelBene" is never touched.
 */
function titleCaseIfShouted(name: string): string {
  if (/[a-z]/.test(name)) return name;
  return name
    .toLowerCase()
    .replace(/(^|[\s('\-])([a-z])/g, (_, lead: string, ch: string) => lead + ch.toUpperCase())
    .replace(/\bMc([a-z])/g, (_, ch: string) => `Mc${ch.toUpperCase()}`);
}

/**
 * Strips form-filling noise from a chosen name.
 *
 * Sometimes every spelling is polluted, so picking between them can't help:
 * Neal Dunn is filed only as "Neal Patrick Dunn, MD, FACS" and "Neal Patrick
 * MD, Facs Dunn" — the second with his surname stranded mid-name. Removing the
 * post-nominals makes both read "Neal Patrick Dunn".
 *
 * Only applied when at least two words survive, so a name that is somehow all
 * honorific is left alone rather than emptied.
 */
function cleanName(name: string): string {
  const stripped = name
    .split(/\s+/)
    .filter((w) => !NAME_NOISE.test(w.replace(/[^A-Za-z]/g, "")))
    .join(" ")
    .replace(/\s*,\s*$/, "")
    .replace(/\s+,/g, ",")
    .replace(/,+/g, ",")
    .replace(/\s{2,}/g, " ")
    .replace(/[,\s]+$/, "")
    .trim();
  const words = stripped.split(/\s+/).filter(Boolean);
  if (words.length < 2) return name;
  // "Scott Scott Franklin" -> "Scott Franklin"
  return words.filter((w, i) => i === 0 || w.toLowerCase() !== words[i - 1].toLowerCase()).join(" ");
}

/**
 * Picks the spelling to display from the several a member is filed under.
 *
 * This is the page's <h1> and <title>, so it's worth more than "take the
 * shortest". The corpus contains "Hon. Marjorie Taylor Mrs Greene",
 * "Hon. Scott Scott Franklin", "JOHN BOOZMAN" and "Hon. Neal Patrick MD, Facs
 * Dunn" alongside the clean versions of each.
 *
 * Preference order: a name without stray honorifics, without a stuttered
 * repeated word, not SHOUTED, then the one the filings actually use most —
 * frequency being the best available evidence of what the official source
 * calls this person, which keeps real suffixes like "Kean Jr" that a
 * shortest-wins rule would throw away.
 */
function bestSpelling(names: string[], weight: Map<string, number>): string {
  const score = (raw: string) => {
    const name = displayName(raw);
    const words = name.toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
    const stutters = words.filter((w, i) => i > 0 && w === words[i - 1]).length;
    return {
      noise: NAME_NOISE.test(name) ? 1 : 0,
      stutters,
      shouted: (name.match(/[A-Z]/g) ?? []).length > name.length / 2 ? 1 : 0,
      uses: weight.get(raw) ?? 0,
      length: name.length,
    };
  };
  return [...names].sort((a, b) => {
    const x = score(a);
    const y = score(b);
    return x.noise - y.noise || x.stutters - y.stutters || x.shouted - y.shouted || y.uses - x.uses || x.length - y.length;
  })[0];
}

/** A grouped person, carrying the rows they were built from. */
export type MemberGroup<T> = MemberDirectoryEntry & { rows: T[] };

/**
 * Collapses raw (name, bioguide) rows into one entry per real person.
 *
 * Keyed on bioguide_id, which Congress assigns per person and which the ingest
 * resolves per filing — so it survives spelling drift, honorifics, suffixes and
 * redistricting alike.
 *
 * The two passes matter. Some filings have no resolved bioguide, and keying
 * those on their name alone splits a person in half when the *same* name is
 * resolved on their other filings: "Hon. Scott Scott Franklin" appears both
 * with F000472 (87 trades) and with NULL (12), which made 12 of his trades a
 * separate politician. So names are mapped to a bioguide first, and an
 * unresolved row inherits the identity its own name already has elsewhere.
 * Only a name that is never resolved anywhere falls back to a name key.
 */
export function groupMembers<T extends { member_name: string; bioguide_id: string | null; trades: number }>(
  rows: T[]
): MemberGroup<T>[] {
  const nameToBioguide = new Map<string, string>();
  for (const row of rows) {
    if (row.bioguide_id && !nameToBioguide.has(row.member_name)) nameToBioguide.set(row.member_name, row.bioguide_id);
  }

  const byKey = new Map<string, MemberGroup<T>>();
  for (const row of rows) {
    const key = row.bioguide_id ?? nameToBioguide.get(row.member_name) ?? `name:${memberSlug(row.member_name)}`;
    const existing = byKey.get(key);
    if (existing) {
      if (!existing.names.includes(row.member_name)) existing.names.push(row.member_name);
      existing.trades += row.trades;
      existing.rows.push(row);
    } else {
      byKey.set(key, {
        key,
        bioguideId: row.bioguide_id ?? nameToBioguide.get(row.member_name) ?? null,
        slug: "",
        names: [row.member_name],
        display: "",
        derivedDisplay: "",
        trades: row.trades,
        rows: [row],
      });
    }
  }

  const entries = [...byKey.values()];
  for (const e of entries) {
    const weight = new Map<string, number>();
    for (const r of e.rows) weight.set(r.member_name, (weight.get(r.member_name) ?? 0) + r.trades);
    // What the filings alone would produce. Kept even when a curated name
    // overrides it, so a URL built from it still resolves — see
    // resolveMemberSlug.
    e.derivedDisplay = titleCaseIfShouted(cleanName(displayName(bestSpelling(e.names, weight))));
    e.display = (e.bioguideId && MEMBER_DISPLAY_NAMES[e.bioguideId]) || e.derivedDisplay;
    e.slug = memberSlug(e.display);
  }

  // Two different people whose preferred spelling slugs identically would
  // otherwise share a URL and silently show each other's trades. Doesn't happen
  // in the corpus today, but a namesake arriving later must not break the page —
  // so the busier one keeps the clean slug and the other gets its bioguide.
  const seen = new Map<string, MemberGroup<T>>();
  for (const e of [...entries].sort((a, b) => b.trades - a.trades)) {
    const clash = seen.get(e.slug);
    if (clash && e.bioguideId) e.slug = `${e.slug}-${e.bioguideId.toLowerCase()}`;
    seen.set(e.slug, e);
  }

  return entries.sort((a, b) => b.trades - a.trades);
}

export async function getMemberDirectory(): Promise<MemberDirectoryEntry[]> {
  const rows = (await sql.query(
    `SELECT t.member_name, f.bioguide_id, COUNT(*)::int AS trades
     FROM transactions t JOIN filings f ON f.doc_id = t.doc_id
     WHERE ${PUBLISHED_FILING_SQL}
     GROUP BY 1, 2`
  )) as { member_name: string; bioguide_id: string | null; trades: number }[];
  return groupMembers(rows);
}

/**
 * Finds the member a URL refers to.
 *
 * `redirectTo` is set when the slug matches an *old* spelling of someone whose
 * canonical slug is now different — "marjorie-taylor-mrs-greene" resolving to
 * "marjorie-taylor-greene". Name spellings drift as the disclosure sites change
 * how they write them, and a URL that worked yesterday shouldn't 404 today.
 */
export function resolveMemberSlug(
  directory: MemberDirectoryEntry[],
  slug: string
): { entry: MemberDirectoryEntry; redirectTo: string | null } | null {
  const exact = directory.find((m) => m.slug === slug);
  if (exact) return { entry: exact, redirectTo: null };

  // Any earlier form of this person's URL: a raw filed spelling, or the name
  // the filings implied before a curated one replaced it ("rohit-khanna" and
  // "neal-patrick-dunn" both still resolve).
  const byVariant = directory.find(
    (m) => memberSlug(m.derivedDisplay) === slug || m.names.some((n) => memberSlug(n) === slug)
  );
  return byVariant ? { entry: byVariant, redirectTo: byVariant.slug } : null;
}

export interface MemberProfile {
  slug: string;
  display: string;
  names: string[];
  party: string | null;
  state: string | null;
  state_district: string | null;
  chamber: "house" | "senate" | null;
  photo_url: string | null;
  trade_count: number;
  volume_low: number;
  first_filed: string | null;
  last_filed: string | null;
  purchases: number;
  sales: number;
  top_tickers: { ticker: string; count: number }[];
}

export interface MemberTrade {
  id: number;
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
  days_to_file: number | null;
}

/** How many trades a member page lists before pointing at the full filter UI. */
export const MEMBER_PAGE_TRADE_LIMIT = 100;

export async function getMemberBySlug(
  slug: string
): Promise<{ profile: MemberProfile; trades: MemberTrade[]; redirectTo: string | null } | null> {
  const resolved = resolveMemberSlug(await getMemberDirectory(), slug);
  if (!resolved) return null;
  const { entry, redirectTo } = resolved;

  const [summaryRows, tickerRows, tradeRows] = await Promise.all([
    sql.query(
      `SELECT COUNT(*)::int AS trade_count,
              COALESCE(SUM(t.amount_low), 0)::bigint AS volume_low,
              MIN(NULLIF(f.filing_date, '')) AS first_filed,
              MAX(NULLIF(f.filing_date, '')) AS last_filed,
              COUNT(*) FILTER (WHERE t.transaction_type ILIKE 'P%')::int AS purchases,
              COUNT(*) FILTER (WHERE t.transaction_type ILIKE 'S%')::int AS sales,
              (ARRAY_AGG(f.chamber ORDER BY f.filing_date DESC))[1] AS chamber,
              (ARRAY_AGG(t.state_district ORDER BY f.filing_date DESC))[1] AS state_district,
              (ARRAY_AGG(COALESCE(mh.party, mr.party) ORDER BY f.filing_date DESC))[1] AS party,
              (ARRAY_AGG(COALESCE(mh.state, mr.state) ORDER BY f.filing_date DESC))[1] AS state,
              (ARRAY_AGG(COALESCE(mh.photo_url, mr.photo_url) ORDER BY f.filing_date DESC))[1] AS photo_url
       FROM transactions t
       JOIN filings f ON f.doc_id = t.doc_id
       LEFT JOIN members_reference mr ON mr.state_district = t.state_district
       LEFT JOIN members_history mh ON mh.bioguide_id = f.bioguide_id
       WHERE t.member_name = ANY($1) AND ${PUBLISHED_FILING_SQL}`,
      [entry.names]
    ),
    sql.query(
      `SELECT t.ticker, COUNT(*)::int AS count
       FROM transactions t JOIN filings f ON f.doc_id = t.doc_id
       WHERE t.member_name = ANY($1) AND ${PUBLISHED_FILING_SQL}
         AND t.ticker IS NOT NULL AND t.ticker <> ''
       GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
      [entry.names]
    ),
    sql.query(
      `SELECT t.id, t.asset_name, t.ticker, t.asset_type_code, t.owner, t.transaction_type,
              t.transaction_date, t.amount_range, t.amount_low, t.amount_high,
              f.filing_date, f.pdf_url,
              (NULLIF(f.filing_date, '')::date - NULLIF(t.transaction_date, '')::date) AS days_to_file
       FROM transactions t JOIN filings f ON f.doc_id = t.doc_id
       WHERE t.member_name = ANY($1) AND ${PUBLISHED_FILING_SQL}
       ORDER BY f.filing_date DESC NULLS LAST, t.transaction_date DESC NULLS LAST, t.id DESC
       LIMIT ${MEMBER_PAGE_TRADE_LIMIT}`,
      [entry.names]
    ),
  ]);

  const s = (summaryRows as Record<string, unknown>[])[0];
  return {
    redirectTo,
    profile: {
      slug: entry.slug,
      display: entry.display,
      names: entry.names,
      party: (s?.party as string) ?? null,
      state: (s?.state as string) ?? null,
      state_district: (s?.state_district as string) ?? null,
      chamber: (s?.chamber as "house" | "senate") ?? null,
      photo_url: (s?.photo_url as string) ?? null,
      trade_count: Number(s?.trade_count ?? 0),
      volume_low: Number(s?.volume_low ?? 0),
      first_filed: (s?.first_filed as string) ?? null,
      last_filed: (s?.last_filed as string) ?? null,
      purchases: Number(s?.purchases ?? 0),
      sales: Number(s?.sales ?? 0),
      top_tickers: tickerRows as { ticker: string; count: number }[],
    },
    trades: tradeRows as MemberTrade[],
  };
}
