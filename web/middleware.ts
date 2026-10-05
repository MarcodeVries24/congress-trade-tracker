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

// Runs on the API and the account page (matcher below), so `auth()` is
// available where the server checks who is calling: API routes such as
// app/api/trades/route.ts, which check the plan before honouring gated
// filters, and the account page.
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
  matcher: [
    // Only where the server reads who is signed in: the API (plan checks,
    // alerts, the store and Stripe routes) and the account page. Every other
    // page is the same for everyone, cached, and signs people in in the
    // browser, so running Clerk in front of it was an invocation per page view,
    // per prefetch and per crawler request for nothing. It also kept robots.txt,
    // sitemap.xml and ads.txt clear of the auth layer, which still holds.
    "/(api|trpc)(.*)",
    "/account(.*)",
  ],
};
