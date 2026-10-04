import { NextRequest, NextResponse } from "next/server";
import { getTimingOverviewCached, parseTimingWindow } from "@/lib/timing";

/**
 * "Before the public knew" for the home page and the app's Discover: the
 * best-timed recent trades, the members whose trades most often move their
 * way before disclosure, and the figures for everyone. `?days=` is 30, 90 or
 * 365 (default 365, DEFAULT_TIMING_WINDOW).
 *
 * Free, like the trade pages it links to: it is the clearest single picture
 * of what the site does. Prices only move once a day, so an hour at the edge
 * costs nothing in freshness.
 */
export async function GET(req: NextRequest) {
  const days = parseTimingWindow(req.nextUrl.searchParams.get("days"));
  const overview = await getTimingOverviewCached(days, { trades: 12, leaders: 10 });
  return NextResponse.json(overview, {
    headers: {
      // Browsers always ask again (a stale-while-revalidate here let them show
      // an old ranking after it changed); the CDN keeps it for an hour.
      "cache-control": "public, max-age=0, must-revalidate",
      "CDN-Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
