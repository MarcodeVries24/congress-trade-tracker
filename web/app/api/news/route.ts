import { NextResponse } from "next/server";
import { getGeneralNews } from "@/lib/newsFeed";

/**
 * The home page's news row, and the app's news screen. `?limit=` asks for
 * more per desk (the app shows as many as the website's news page), up to the
 * nine that page shows.
 *
 * Read per request rather than prerendered, since the limit is in the query;
 * the feeds themselves are fetched with a half-hour revalidate in
 * lib/newsFeed.ts, and the CDN caches each URL for as long.
 */

export async function GET(req: Request) {
  const asked = Number(new URL(req.url).searchParams.get("limit"));
  const limit = Number.isInteger(asked) && asked > 0 ? Math.min(asked, 9) : 4;
  const sections = await getGeneralNews(limit);
  return NextResponse.json(
    { sections },
    { headers: { "cache-control": "public, s-maxage=1800, stale-while-revalidate=86400" } }
  );
}
