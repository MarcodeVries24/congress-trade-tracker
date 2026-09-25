import { NextRequest, NextResponse } from "next/server";
import { sql, PLAUSIBLE_DATES_SQL, PUBLISHED_FILING_SQL, VOLUME_MIDPOINT_SQL } from "@/lib/db";
import { groupMembers } from "@/lib/members";

const SORT_KEYS = new Set(["trade_count", "volume_sum", "last_filed"]);

// A politician leaderboard — free/ungated, like /api/members and
// /api/dashboard.
//
// One row per *person*, keyed on bioguide_id. Grouping on the disclosed name
// doesn't give that: the corpus holds the same member under several spellings
// because the disclosure sites aren't consistent — Marjorie Taylor Greene as
// both "Marjorie Taylor Greene" and "Marjorie Taylor Mrs Greene", Scott
// Franklin four ways, Thomas Kean three, John Boozman once in capitals. Each
// variant was its own leaderboard row with a share of the trades.
//
// bioguide_id is assigned per person and resolved per filing, so it survives
// spelling drift, honorifics, suffixes and redistricting alike (a redistricted
// member's filings carry two different state_district values — Pelosi's CA11
// and CA12 both resolve to P000197). The displayed district is whichever the
// most recent filing reported.
//
// The merge happens in TypeScript rather than SQL, and the query returns every
// group rather than a page of them, for one reason: /politicians/[slug] groups
// the same people with the same function. A second implementation in SQL would
// eventually disagree with it, and the symptom would be a leaderboard row
// linking to a page showing different totals. There are fewer than 300 members,
// so paginating in memory costs nothing.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? undefined;
  const chambers = sp.getAll("chamber");
  const sortKey = sp.get("sort") ?? "trade_count";
  const sortField = SORT_KEYS.has(sortKey) ? sortKey : "trade_count";
  const order = sp.get("order")?.toLowerCase() === "asc" ? "ASC" : "DESC";

  const limitNum = Math.min(Number(sp.get("limit")) || 25, 200);
  const pageNum = Math.max(Number(sp.get("page")) || 1, 1);
  const offset = (pageNum - 1) * limitNum;

  const conditions: string[] = [PLAUSIBLE_DATES_SQL];
  const params: unknown[] = [];
  const addParam = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  // Chamber stays in SQL — it's a real partition, and no member in the corpus
  // has filed in both. The text search is applied after merging instead, so a
  // query matching only one spelling of a name still returns that person's
  // full totals rather than a fragment of them.
  if (chambers.length) {
    const placeholders = chambers.map((c) => addParam(c));
    conditions.push(`f.chamber IN (${placeholders.join(", ")})`);
  }
  conditions.push(PUBLISHED_FILING_SQL);
  const where = `WHERE ${conditions.join(" AND ")}`;

  const rawRows = (await sql.query(
    `SELECT t.member_name, f.bioguide_id,
            (ARRAY_AGG(t.state_district ORDER BY f.filing_date DESC NULLS LAST))[1] AS state_district,
            COALESCE(mh.party, (ARRAY_AGG(mr.party ORDER BY f.filing_date DESC NULLS LAST))[1]) AS party,
            COALESCE(mh.photo_url, (ARRAY_AGG(mr.photo_url ORDER BY f.filing_date DESC NULLS LAST))[1]) AS photo_url,
            COALESCE(mh.state, (ARRAY_AGG(mr.state ORDER BY f.filing_date DESC NULLS LAST))[1]) AS member_state,
            f.chamber, COUNT(*)::int AS trade_count, ${VOLUME_MIDPOINT_SQL}::float8 AS volume_sum,
            MAX(f.filing_date) AS last_filed
     FROM transactions t
     JOIN filings f ON f.doc_id = t.doc_id
     LEFT JOIN members_reference mr ON mr.state_district = t.state_district
     LEFT JOIN members_history mh ON mh.bioguide_id = f.bioguide_id
     ${where}
     GROUP BY t.member_name, f.bioguide_id, mh.party, mh.photo_url, mh.state, f.chamber
     ORDER BY MAX(f.filing_date) DESC NULLS LAST`,
    params
  )) as {
    member_name: string; bioguide_id: string | null; state_district: string | null;
    party: string | null; photo_url: string | null; member_state: string | null;
    chamber: "house" | "senate"; trade_count: number; volume_sum: number; last_filed: string | null;
  }[];

  // Same grouping the member pages use, so a row and the page it links to can
  // never disagree.
  const identities = groupMembers(rawRows.map((r) => ({ ...r, trades: r.trade_count })));
  let merged = identities.map((id) => {
    // Sum over the rows themselves, not over distinct names: one name can
    // appear twice (resolved and unresolved bioguide), and summing per name
    // would quietly drop the second.
    const parts = id.rows;
    // Display fields come from the most recently filed variant — rawRows is
    // already ordered by last_filed, so the first row here is the freshest.
    const latest = parts[0];
    return {
      member_name: id.display,
      slug: id.slug,
      state_district: latest?.state_district ?? null,
      party: latest?.party ?? null,
      photo_url: latest?.photo_url ?? null,
      member_state: latest?.member_state ?? null,
      chamber: latest?.chamber ?? "house",
      trade_count: parts.reduce((sum, p) => sum + p.trade_count, 0),
      volume_sum: parts.reduce((sum, p) => sum + (p.volume_sum ?? 0), 0),
      last_filed: parts.reduce<string | null>((max, p) => (!max || (p.last_filed ?? "") > max ? p.last_filed : max), null),
      _names: id.names,
    };
  });

  if (q) {
    const needle = q.toLowerCase();
    merged = merged.filter((m) => m._names.some((n) => n.toLowerCase().includes(needle)));
  }

  const direction = order === "ASC" ? 1 : -1;
  merged.sort((a, b) => {
    const pick = (m: typeof a) =>
      sortField === "volume_sum" ? m.volume_sum : sortField === "last_filed" ? (m.last_filed ?? "") : m.trade_count;
    const av = pick(a);
    const bv = pick(b);
    return av < bv ? -direction : av > bv ? direction : 0;
  });

  const total = merged.length;
  const data = merged.slice(offset, offset + limitNum).map(({ _names, ...row }) => row);

  return NextResponse.json({
    data,
    page: pageNum,
    limit: limitNum,
    total,
    totalPages: Math.ceil(total / limitNum),
  });
}
