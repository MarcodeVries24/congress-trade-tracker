import { clerkMiddleware } from "@clerk/nextjs/server";

// Runs on every request (matcher below) so `auth()` is available both in
// server components (app/page.tsx) and in API routes (app/api/trades/route.ts)
// that need to check the caller's plan before honoring gated filter params.
export default clerkMiddleware();

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
