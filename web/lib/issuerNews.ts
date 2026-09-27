import { fetchFeed, type FeedItem } from "./feeds";

/**
 * Recent headlines for one ticker, from Yahoo Finance's per-symbol feed.
 *
 * Headline, source and link only, straight to the publisher. Nothing is
 * re-hosted and nothing is rewritten, which is the arrangement an RSS feed is
 * published for.
 *
 * The feed is loose about relevance: a request for NVDA returns plenty of
 * articles that only mention it in passing, and some that don't mention it at
 * all. Hence the filter below. Even filtered this is aggregator fare rather
 * than the wires, so it sits under the trade table as context, never as the
 * reason the page exists.
 */
export async function getIssuerNews(
  ticker: string,
  companyName: string | null,
  limit = 4
): Promise<FeedItem[]> {
  const symbol = ticker.trim().toUpperCase();
  if (!/^[A-Z.\-]{1,10}$/.test(symbol)) return [];

  const items = await fetchFeed(
    `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`,
    "Yahoo Finance",
    { limit: 25, revalidate: 3600 }
  );

  return items.filter((item) => mentions(item, symbol, companyName)).slice(0, limit);
}

/**
 * Whether a headline is actually about this company.
 *
 * The ticker is matched on word boundaries so ALL doesn't match "all" and
 * BE doesn't match "before". The company's first word carries most of the
 * signal — "Nvidia", "Microsoft" — while the rest ("Corporation", "Inc",
 * "Common Stock") matches everything and is dropped.
 */
function mentions(item: FeedItem, symbol: string, companyName: string | null): boolean {
  const haystack = item.title;
  if (new RegExp(`\\b${symbol.replace(/[.\-]/g, "\\$&")}\\b`).test(haystack)) return true;

  const first = companyName?.trim().split(/[\s,.]+/)[0];
  if (!first || first.length < 4) return false;
  return new RegExp(`\\b${first.replace(/[^\w]/g, "")}`, "i").test(haystack);
}
