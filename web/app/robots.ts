import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Previously a 404. Google treats a missing robots.txt as "crawl everything",
 * so nothing was actually blocked — but there was also nowhere to declare the
 * sitemap, and an AdSense reviewer checking the usual boxes finds a 404.
 *
 * Blocks only what is listed below, and never /api. Leaving /api open looks
 * like an oversight and isn't: every page on this site fetches its data client-side,
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
// Crawlers that collect pages to train or feed AI models. They bring no
// visitors, and one of them reading every page is what used up the free
// plan's function calls in October 2026.
const AI_CRAWLERS = [
  "GPTBot",
  "CCBot",
  "ClaudeBot",
  "anthropic-ai",
  "Bytespider",
  "Amazonbot",
  "meta-externalagent",
  "PerplexityBot",
  "Google-Extended",
  "Applebot-Extended",
  "cohere-ai",
  "Diffbot",
  "omgili",
  "Timpibot",
  "ImagesiftBot",
];

/**
 * The ~65,000 single-trade pages are left out of crawling: each one is a
 * server render the first time it is asked for, crawlers worked through all
 * of them, and every trade is already listed on its member's page, which is
 * where search traffic should land. The pages stay reachable for people.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: AI_CRAWLERS, disallow: "/" },
      { userAgent: "*", allow: "/", disallow: "/trades/" },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
