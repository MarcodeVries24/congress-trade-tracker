import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Previously a 404. Google treats a missing robots.txt as "crawl everything",
 * so nothing was actually blocked — but there was also nowhere to declare the
 * sitemap, and an AdSense reviewer checking the usual boxes finds a 404.
 *
 * Deliberately blocks nothing at all, including /api. That looks like an
 * oversight and isn't: every page on this site fetches its data client-side,
 * so Googlebot's renderer has to call /api/trades to see any content whatsoever.
 * Disallowing /api — the instinctive thing to do, since it isn't "pages" — would
 * leave the crawler looking at empty shells and make the thin-content problem
 * strictly worse.
 *
 * /account and /unsubscribe aren't disallowed either. They already carry
 * `noindex`, and a page blocked in robots.txt can't be crawled to *discover*
 * its noindex — which is how URLs end up listed as "indexed, though blocked by
 * robots.txt". Letting them be crawled is what actually keeps them out.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
