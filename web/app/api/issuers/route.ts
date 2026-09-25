import { NextRequest, NextResponse } from "next/server";
import { getIssuerDirectory } from "@/lib/issuers";

/**
 * The issuer directory — free/ungated, like /api/politicians and /api/stats.
 *
 * Filtering, sorting and paging happen in memory over the full directory
 * rather than in SQL, for the same reason /api/politicians does it: the
 * issuer *pages* group the corpus with getIssuerBySlug, and a second grouping
 * expressed in SQL would eventually disagree with the first. The symptom
 * would be a row whose numbers change when you click it. ~2,600 issuers is
 * nothing to sort in memory.
 */

const SORT_KEYS = new Set(["trade_count", "volume_sum", "politician_count", "market_cap", "last_traded"]);

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim().toLowerCase();
  const sortKey = sp.get("sort") ?? "trade_count";
  const sortField = SORT_KEYS.has(sortKey) ? sortKey : "trade_count";
  const direction = sp.get("order")?.toLowerCase() === "asc" ? 1 : -1;

  const limit = Math.min(Number(sp.get("limit")) || 25, 200);
  const page = Math.max(Number(sp.get("page")) || 1, 1);

  let rows = await getIssuerDirectory();

  if (q) {
    rows = rows.filter((r) => r.ticker.toLowerCase().includes(q) || (r.company_name ?? "").toLowerCase().includes(q));
  }

  rows = [...rows].sort((a, b) => {
    const pick = (r: (typeof rows)[number]) =>
      sortField === "volume_sum"
        ? r.volume_sum
        : sortField === "politician_count"
          ? r.politician_count
          : sortField === "market_cap"
            ? // An issuer with no cap sorts last in either direction rather
              // than pretending to be worth nothing.
              (r.market_cap ?? Number.NEGATIVE_INFINITY)
            : sortField === "last_traded"
              ? (r.last_traded ?? "")
              : r.trade_count;
    const av = pick(a);
    const bv = pick(b);
    return av < bv ? -direction : av > bv ? direction : 0;
  });

  const total = rows.length;
  return NextResponse.json({
    data: rows.slice((page - 1) * limit, (page - 1) * limit + limit),
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
  });
}
