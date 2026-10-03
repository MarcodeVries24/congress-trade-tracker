import { NextRequest, NextResponse } from "next/server";
import { daysAgo, getPriceSeries } from "@/lib/priceSeries";

/**
 * Daily closes for one ticker, for the app's charts. Free, like the company
 * pages that show the same chart on the website.
 *
 * `from` defaults to two years back and is clamped to ten, which covers the
 * oldest trade on file without letting a request ask for decades.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const symbol = decodeURIComponent(ticker).trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,12}$/.test(symbol)) {
    return NextResponse.json({ error: "Unknown ticker" }, { status: 400 });
  }
  const requested = req.nextUrl.searchParams.get("from");
  const earliest = daysAgo(3650);
  const from =
    requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? (requested < earliest ? earliest : requested) : daysAgo(730);

  const points = await getPriceSeries(symbol, from);
  if (!points) return NextResponse.json({ ticker: symbol, points: [] }, { status: 404 });
  return NextResponse.json(
    { ticker: symbol, points },
    {
      headers: {
        "cache-control": "public, s-maxage=21600, stale-while-revalidate=86400",
      },
    }
  );
}
