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
 */
export const PUBLIC_DAILY_HEADERS = {
  "Cache-Control": "public, max-age=0, must-revalidate",
  "CDN-Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
};

export function publicJson(data: unknown): NextResponse {
  return NextResponse.json(data, { headers: PUBLIC_DAILY_HEADERS });
}
