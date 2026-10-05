import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Cross-origin access for the mobile app during local development only.
 *
 * The Expo web target runs on localhost:8081 and the API on localhost:3000, so
 * every request from it is cross-origin and the browser blocks it. Native
 * builds are not origin-checked and never need this, which is exactly why it
 * must not be switched on in production: opening the API to arbitrary origins
 * to fix a browser-only problem the shipping app does not have would be paying
 * a real cost for nothing.
 *
 * Guarded on NODE_ENV rather than on an allowlist env var, so that there is no
 * variable anyone can set on the deployed site to turn it on by accident.
 */
const LOCALHOST_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

function devCors(req: NextRequest): Headers | null {
  if (process.env.NODE_ENV === "production") return null;
  if (!req.nextUrl.pathname.startsWith("/api/")) return null;
  const origin = req.headers.get("origin");
  if (!origin || !LOCALHOST_ORIGIN.test(origin)) return null;

  const headers = new Headers();
  // The specific origin, never "*": the app sends an Authorization header, and
  // a wildcard cannot be combined with credentialed requests.
  headers.set("access-control-allow-origin", origin);
  headers.set("vary", "Origin");
  headers.set("access-control-allow-methods", "GET, POST, PATCH, DELETE, OPTIONS");
  headers.set("access-control-allow-headers", "authorization, content-type");
  headers.set("access-control-max-age", "600");
  return headers;
}

// Runs only where the server checks who is calling (matcher below), so
// `auth()` is available there: the account and admin pages, the API routes
// that act for an account, and /api/trades when it is asked for a Pro filter.
export default clerkMiddleware(async (_auth, req) => {
  const cors = devCors(req);
  if (!cors) return;
  // An Authorization header makes the browser send a preflight first, which
  // never reaches the route handler, so it is answered here.
  if (req.method === "OPTIONS") return new NextResponse(null, { status: 204, headers: cors });
  const res = NextResponse.next();
  cors.forEach((value, key) => res.headers.set(key, value));
  return res;
});

export const config = {
  // Only where the server reads who is signed in. Every other request, cached
  // pages and the public API alike, is the same for everyone, and on Vercel a
  // middleware runs before the cache, so running Clerk there cost a function
  // call per page view, per crawler request and per public API call.
  //
  // - /account and /admin: pages that check the account on the server.
  // - The API routes that act for an account.
  // - /api/trades only when it carries a Pro filter: the route checks Pro for
  //   those alone (one entry per parameter, as a matcher cannot list
  //   alternatives; keep in step with @congtrade/shared/tradeFilters, which a
  //   matcher cannot import).
  //
  // robots.txt, sitemap.xml and ads.txt stay clear of the auth layer.
  matcher: [
    "/account(.*)",
    "/admin(.*)",
    "/api/(account|admin|alerts|push|store|stripe)(.*)",
    { source: "/api/trades", has: [{ type: "query", key: "members" }] },
    { source: "/api/trades", has: [{ type: "query", key: "tickers" }] },
    { source: "/api/trades", has: [{ type: "query", key: "parties" }] },
    { source: "/api/trades", has: [{ type: "query", key: "states" }] },
    { source: "/api/trades", has: [{ type: "query", key: "state" }] },
    { source: "/api/trades", has: [{ type: "query", key: "types" }] },
    { source: "/api/trades", has: [{ type: "query", key: "owners" }] },
    { source: "/api/trades", has: [{ type: "query", key: "minAmount" }] },
    { source: "/api/trades", has: [{ type: "query", key: "amountRanges" }] },
    { source: "/api/trades", has: [{ type: "query", key: "marketCapTiers" }] },
    { source: "/api/trades", has: [{ type: "query", key: "filedStatus" }] },
    { source: "/api/trades", has: [{ type: "query", key: "dateFrom" }] },
    { source: "/api/trades", has: [{ type: "query", key: "dateTo" }] },
    { source: "/api/trades", has: [{ type: "query", key: "tradedFrom" }] },
    { source: "/api/trades", has: [{ type: "query", key: "tradedTo" }] },
  ],
};
