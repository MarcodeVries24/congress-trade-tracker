import { fetchFeed, type FeedItem } from "./feeds";

/**
 * The two commercial feeds, kept apart from the agency releases on purpose.
 *
 * The agency strip is public-domain primary sources and says so; these are
 * other people's journalism, shown as headline, credit and link, each one
 * leaving for the publisher. Mixing the two into one list would blur the
 * distinction the rest of the site is built on.
 *
 * CNBC's Economy desk covers what moves the disclosures on this site — the
 * Fed, Treasury yields, the data prints. MarketWatch's top stories run wider
 * and towards personal finance, and are the only feed anywhere in this
 * project that ships pictures.
 */
export type NewsSection = {
  key: string;
  /** How the publisher writes its own name. */
  publisher: string;
  /** Where the feed's own homepage is, for the credit link. */
  homepage: string;
  blurb: string;
  items: FeedItem[];
};

const SOURCES = [
  {
    key: "cnbc",
    publisher: "CNBC",
    homepage: "https://www.cnbc.com/economy/",
    blurb: "Economy desk",
    url: "https://www.cnbc.com/id/20910258/device/rss/rss.html",
  },
  {
    key: "marketwatch",
    publisher: "MarketWatch",
    homepage: "https://www.marketwatch.com/",
    blurb: "Top stories",
    url: "https://feeds.content.dowjones.io/public/rss/mw_topstories",
  },
];

export async function getGeneralNews(limit = 8): Promise<NewsSection[]> {
  const results = await Promise.allSettled(
    SOURCES.map((s) => fetchFeed(s.url, s.publisher, { limit, revalidate: 1800 }))
  );

  return SOURCES.map((source, i) => {
    const result = results[i];
    return {
      key: source.key,
      publisher: source.publisher,
      homepage: source.homepage,
      blurb: source.blurb,
      items: result.status === "fulfilled" ? result.value : [],
    };
  }).filter((section) => section.items.length > 0);
}
