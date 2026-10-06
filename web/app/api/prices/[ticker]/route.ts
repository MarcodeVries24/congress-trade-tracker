import { NextRequest, NextResponse } from "next/server";
import { getPriceSeries, SERIES_START } from "@/lib/priceSeries";

/**
 * Daily closes for one ticker, for the app's charts. Free, like the company
 * pages that show the same chart on the website.
 *
 * `from` cuts the series to start there; without it, the whole series.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const symbol = decodeURIComponent(ticker).trim().toUpperCase();
  if (!/^[A-Z0-9.\-]{1,12}$/.test(symbol)) {
    return NextResponse.json({ error: "Unknown ticker" }, { status: 400 });
  }
  // Without `from`, the whole series (from SERIES_START): the website asks for
  // that, one cached answer per ticker, and cuts it to the days it shows.
  const requested = req.nextUrl.searchParams.get("from");
  const from = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : SERIES_START;

  const points = await getPriceSeries(symbol, from);
  if (!points) return NextResponse.json({ ticker: symbol, points: [] }, { status: 404 });
  return NextResponse.json(
    { ticker: symbol, points },
    {
      headers: {
        "cache-control": "public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400",
      },
    }
  );
}
