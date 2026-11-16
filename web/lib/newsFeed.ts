import { fetchFeed, type FeedItem } from "./feeds";
import { pictureHeadlines } from "./newsImages";

/**
 * The commercial feeds, kept apart from the agency releases on purpose.
 *
 * The agency strip is public-domain primary sources and says so; these are
 * other people's journalism, shown as headline, credit and link, each one
 * leaving for the publisher. Mixing the two into one list would blur the
 * distinction the rest of the site is built on.
 *
 * Both desks are CNBC's: Economy for the Fed, Treasury yields and the data
 * prints, Markets for what the tape did about them. MarketWatch's top stories
 * were here too and were dropped, being personal-finance features that read
 * as somebody else's newsletter pasted in beside congressional trades.
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
    key: "cnbc-markets",
    publisher: "CNBC",
    homepage: "https://www.cnbc.com/investing/",
    blurb: "Markets and investing",
    url: "https://www.cnbc.com/id/15839069/device/rss/rss.html",
  },
];

export async function getGeneralNews(limit = 8): Promise<NewsSection[]> {
  const results = await Promise.allSettled(
    SOURCES.map((s) => fetchFeed(s.url, s.publisher, { limit }))
  );

  const sections = SOURCES.map((source, i) => {
    const result = results[i];
    return {
      key: source.key,
      publisher: source.publisher,
      homepage: source.homepage,
      blurb: source.blurb,
      items: result.status === "fulfilled" ? result.value : [],
    };
  }).filter((section) => section.items.length > 0);

  for (const section of sections) pictureHeadlines(section.items);
  return sections;
}
