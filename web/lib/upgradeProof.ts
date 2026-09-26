import { sql, PLAUSIBLE_DATES_SQL, PUBLISHED_FILING_SQL } from "@/lib/db";
import { ALERT_FROM_SQL } from "@/lib/alertFilters";
import { groupMembers } from "@/lib/members";

/**
 * The evidence the upgrade page argues from.
 *
 * All of it is read from the same tables the site serves, so the pitch can't
 * drift from the product: if ingestion stalls, the "checked" time on the
 * pricing page goes stale in public, which is the right incentive.
 */
export type ProofTrade = {
  member_name: string;
  bioguide_id: string | null;
  chamber: string;
  state: string | null;
  party: string | null;
  ticker: string | null;
  asset_name: string;
  transaction_type: string;
  amount_range: string | null;
  transaction_date: string | null;
  filing_date: string | null;
};

export type ProofFace = {
  name: string;
  slug: string;
  photoUrl: string | null;
  trades: number;
};

export type UpgradeProof = {
  transactions: number;
  filings: number;
  members: number;
  lastCheckedAt: string | null;
  /** Real filings, shown as an example alert. Empty if the query finds none. */
  sample: ProofTrade[];
  /** The most active members, with their official portraits. */
  faces: ProofFace[];
};

let cached: { at: number; value: Promise<UpgradeProof> } | null = null;
const TTL_MS = 5 * 60 * 1000;

/** Cached for five minutes: a pricing page shouldn't run four counts per view. */
export function getUpgradeProof(): Promise<UpgradeProof> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const value = load().catch((err) => {
    cached = null; // don't serve a rejected promise for five minutes
    throw err;
  });
  cached = { at: Date.now(), value };
  return value;
}

/**
 * One row per member. The raw feed clusters — a single filing often lists the
 * same member buying the same stock twice — and three near-identical lines
 * makes the example look like a bug rather than a product.
 */
function distinctMembers(rows: ProofTrade[], limit: number): ProofTrade[] {
  const seen = new Set<string>();
  const picked: ProofTrade[] = [];
  for (const row of rows) {
    const who = row.bioguide_id ?? row.member_name;
    if (seen.has(who)) continue;
    seen.add(who);
    picked.push(row);
    if (picked.length === limit) break;
  }
  return picked;
}

async function load(): Promise<UpgradeProof> {
  const [transactions, filings, members, lastChecked, sample, photos] = (await Promise.all([
    sql.query(
      `SELECT COUNT(*)::int AS n
       FROM transactions t JOIN filings f ON f.doc_id = t.doc_id
       WHERE ${PLAUSIBLE_DATES_SQL} AND ${PUBLISHED_FILING_SQL}`
    ),
    sql.query(`SELECT COUNT(*)::int AS n FROM filings f`),
    // Distinct people, not distinct spellings — grouped the same way
    // /api/stats and the politicians list do, so all three agree.
    sql.query(
      `SELECT t.member_name, f.bioguide_id, COUNT(*)::int AS trades
       FROM transactions t JOIN filings f ON f.doc_id = t.doc_id
       WHERE ${PUBLISHED_FILING_SQL}
       GROUP BY 1, 2`
    ),
    sql.query(`SELECT checked_at FROM ingest_runs LIMIT 1`),
    // The example alert: "House purchases over $50,001", which is both a
    // plausible thing to want and the filter set the page names beside it.
    sql.query(
      `SELECT t.member_name, f.bioguide_id, f.chamber,
              COALESCE(mh.state, mr.state) AS state,
              COALESCE(mh.party, mr.party) AS party,
              t.ticker, t.asset_name, t.transaction_type, t.amount_range,
              t.transaction_date, f.filing_date
       ${ALERT_FROM_SQL}
       WHERE ${PLAUSIBLE_DATES_SQL} AND ${PUBLISHED_FILING_SQL}
         AND f.chamber = 'house'
         AND upper(t.transaction_type) LIKE 'P%'
         AND t.amount_low >= 50001
         AND t.ticker IS NOT NULL AND t.ticker <> ''
       ORDER BY f.filing_date DESC NULLS LAST, t.id DESC
       LIMIT 12`
    ),
    // Official portraits, keyed by bioguide id so the name spellings don't
    // matter — the same person filed three ways still has one photo.
    sql.query(
      `SELECT f.bioguide_id,
              (ARRAY_AGG(COALESCE(mh.photo_url, mr.photo_url) ORDER BY f.filing_date DESC NULLS LAST))[1] AS photo_url
       FROM transactions t
       JOIN filings f ON f.doc_id = t.doc_id
       LEFT JOIN members_reference mr ON mr.state_district = t.state_district
       LEFT JOIN members_history mh ON mh.bioguide_id = f.bioguide_id
       WHERE ${PUBLISHED_FILING_SQL} AND f.bioguide_id IS NOT NULL
       GROUP BY f.bioguide_id`
    ),
  ])) as [
    { n: number }[],
    { n: number }[],
    { member_name: string; bioguide_id: string | null; trades: number }[],
    { checked_at: string }[],
    ProofTrade[],
    { bioguide_id: string; photo_url: string | null }[],
  ];

  const photoByBioguide = new Map(photos.map((row) => [row.bioguide_id, row.photo_url]));
  const directory = groupMembers(members);

  return {
    transactions: transactions[0]?.n ?? 0,
    filings: filings[0]?.n ?? 0,
    members: directory.length,
    lastCheckedAt: lastChecked[0]?.checked_at ?? null,
    sample: distinctMembers(sample, 3),
    // Busiest first, and only those with a portrait: a row of faces broken by
    // three grey initials circles makes the product look half-built.
    faces: directory
      .filter((m) => m.bioguideId && photoByBioguide.get(m.bioguideId))
      .slice(0, 10)
      .map((m) => ({
        name: m.display,
        slug: m.slug,
        photoUrl: photoByBioguide.get(m.bioguideId as string) ?? null,
        trades: m.trades,
      })),
  };
}
