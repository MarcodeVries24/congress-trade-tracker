import { clerkMiddleware } from "@clerk/nextjs/server";

// Runs on every request (matcher below) so `auth()` is available both in
// server components (app/page.tsx) and in API routes (app/api/trades/route.ts)
// that need to check the caller's plan before honoring gated filter params.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes.
    "/(api|trpc)(.*)",
  ],
};
