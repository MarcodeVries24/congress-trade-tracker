import { fetchFeed, type FeedItem } from "./feeds";

/**
 * The policy releases a Congress-trading site sits next to.
 *
 * All five are US federal works, which are not subject to copyright (17
 * U.S.C. §105), so they can be shown without a licence, unlike the finance
 * wires. They are also the only news on this site that is actually adjacent
 * to the data: a rate decision or a CPI print is the thing members are
 * trading around, where a generic markets feed would just be filler that
 * every other site already has.
 *
 * Headlines and links only, each one going straight to the agency. Nothing
 * here is rewritten, summarised or re-hosted.
 */
const SOURCES: { url: string; source: string }[] = [
  { url: "https://www.federalreserve.gov/feeds/press_monetary.xml", source: "Federal Reserve" },
  { url: "https://www.sec.gov/news/pressreleases.rss", source: "SEC" },
  { url: "https://www.bls.gov/feed/cpi.rss", source: "BLS · Inflation" },
  { url: "https://www.bls.gov/feed/empsit.rss", source: "BLS · Jobs" },
  { url: "https://apps.bea.gov/rss/rss.xml", source: "BEA" },
];

/**
 * Newest first, at most one item per source.
 *
 * The cap matters: the Fed publishes bank-merger orders several times a week
 * and would otherwise crowd out the monthly CPI print, which is the item
 * anyone actually wants. One each keeps the strip reading as a dashboard of
 * agencies rather than as a Fed feed with visitors.
 */
export async function getPolicyFeed(limit = 5): Promise<FeedItem[]> {
  const results = await Promise.allSettled(SOURCES.map((s) => fetchFeed(s.url, s.source, { limit: 4 })));

  const newest: FeedItem[] = [];
  for (const result of results) {
    if (result.status !== "fulfilled") continue;
    const [first] = result.value;
    if (first) newest.push(first);
  }

  return newest
    .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
    .slice(0, limit);
}
