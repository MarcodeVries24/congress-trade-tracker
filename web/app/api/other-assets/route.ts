import { NextRequest, NextResponse } from "next/server";
import { getOtherAssetDirectory } from "@/lib/issuers";

/** Free/ungated, like /api/issuers — the same directory, other half. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim().toLowerCase();
  // No practical ceiling: the whole directory is ~3,200 rows, and the page
  // only asks for them when someone clicks "View all".
  const limit = Math.min(Number(sp.get("limit")) || 25, 5000);

  let rows = await getOtherAssetDirectory();
  if (q) rows = rows.filter((r) => r.name.toLowerCase().includes(q) || (r.type ?? "").toLowerCase().includes(q));

  return NextResponse.json({ data: rows.slice(0, limit), total: rows.length });
}
