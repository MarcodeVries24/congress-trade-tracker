import { dangerouslyDeleteByTag } from "@vercel/functions";
import { NextResponse } from "next/server";

/**
 * Caching for public data. The corpus changes once a day (new filings go
 * live when they're approved in /admin), so a response can be served from
 * Vercel's CDN for an hour, and stale for up to a day while it refreshes in
 * the background. A cache hit never reaches a function, which is what keeps
 * Vercel's Fluid Active CPU inside the free plan: crawlers alone ask for
 * thousands of these.
 *
 * Browsers are told to revalidate every time (max-age=0), so nobody holds a
 * copy past what the CDN serves. Only for responses that are the same for
 * every visitor: never for anything that depends on who is signed in.
 *
 * Every such response carries the PUBLISHED_DATA_TAG cache tag, and approving
 * filings in /admin deletes everything with that tag from the CDN
 * (refreshPublishedData), so new trades show at once everywhere. Without it
 * each distinct address kept its own copy for up to an hour: the website's
 * "all trades" and the app's, which ask with different parameters, could
 * disagree for that long.
 */
export const PUBLISHED_DATA_TAG = "published-data";

export const PUBLIC_DAILY_HEADERS = {
  "Cache-Control": "public, max-age=0, must-revalidate",
  "CDN-Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
  "Vercel-Cache-Tag": PUBLISHED_DATA_TAG,
};

/**
 * Drops every CDN copy of published data, after filings were approved. The
 * next request for each waits for a fresh answer rather than being served the
 * old one once more, which is what an admin checking the app right after
 * approving expects. Never fails the approval: at worst the copies expire on
 * their own within the hour. A no-op outside Vercel.
 */
export async function refreshPublishedData(): Promise<void> {
  try {
    await dangerouslyDeleteByTag(PUBLISHED_DATA_TAG);
  } catch (err) {
    console.error("Could not purge the CDN cache:", err);
  }
}

export function publicJson(data: unknown): NextResponse {
  return NextResponse.json(data, { headers: PUBLIC_DAILY_HEADERS });
}
