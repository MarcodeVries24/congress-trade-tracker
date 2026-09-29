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

// Runs on every request (matcher below) so `auth()` is available both in
// server components (app/page.tsx) and in API routes (app/api/trades/route.ts)
// that need to check the caller's plan before honoring gated filter params.
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
    // Skip Next.js internals and static files, unless found in search params.
    //
    // `txt` and `xml` are in that list for a specific reason: robots.txt,
    // sitemap.xml and ads.txt are the three files Google and AdSense fetch,
    // and without them Clerk's middleware ran on all three. It passed them
    // through fine, but an auth layer in front of the files a crawler depends
    // on is a failure mode with no upside — a handshake redirect or a Clerk
    // outage would be served to the crawler instead of the file.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|txt|xml|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
