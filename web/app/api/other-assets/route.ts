import { NextRequest, NextResponse } from "next/server";
import { getOtherAssetDirectory } from "@/lib/issuers";

type SortKey = "trade_count" | "volume_sum" | "last_traded";
const SORT_KEYS = new Set<string>(["trade_count", "volume_sum", "last_traded"]);

/** Free/ungated, like /api/issuers — the same directory, other half. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim().toLowerCase();
  // No practical ceiling: the whole directory is ~3,200 rows, and the page
  // only asks for them when someone clicks "View all".
  const limit = Math.min(Number(sp.get("limit")) || 25, 5000);
  const page = Math.max(Number(sp.get("page")) || 1, 1);
  // Deliberately no sort by member count: these groups fold several filed
  // names together, and distinct members can't be summed across them without
  // double counting, so the stored figure is the widest single spelling
  // rather than a true total. It isn't shown and it isn't sortable.
  const sortField = SORT_KEYS.has(sp.get("sort") ?? "") ? (sp.get("sort") as SortKey) : "trade_count";
  const direction = sp.get("order")?.toLowerCase() === "asc" ? 1 : -1;

  let rows = await getOtherAssetDirectory();
  if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q) || (r.type ?? "").toLowerCase().includes(q));

  rows = [...rows].sort((a, b) => {
    const pick = (r: (typeof rows)[number]) =>
      sortField === "volume_sum" ? r.volume_sum : sortField === "last_traded" ? (r.last_traded ?? "") : r.trade_count;
    const av = pick(a);
    const bv = pick(b);
    return av < bv ? -direction : av > bv ? direction : 0;
  });

  const offset = (page - 1) * limit;
  return NextResponse.json({ data: rows.slice(offset, offset + limit), total: rows.length });
}
