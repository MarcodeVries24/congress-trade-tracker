import { unstable_cache } from "next/cache";

/**
 * A small RSS/Atom reader.
 *
 * Hand-rolled rather than pulled from npm because the job is narrow: take a
 * handful of known government feeds and one finance feed, and get a title, a
 * link and a date out of each. A parser dependency for that is more surface
 * area than the feature is worth, and every feed here is one we can fetch and
 * check ourselves.
 *
 * Deliberately tolerant. These are other people's documents: they change
 * shape without warning, go down, and occasionally serve HTML error pages
 * with a 200. Anything unparseable yields no items rather than an exception,
 * because a news strip must never be able to take a page down with it.
 */
export type FeedItem = {
  title: string;
  url: string;
  /** Who published it, for the badge on the card. */
  source: string;
  /** ISO string, or null when the feed omits or mangles the date. */
  publishedAt: string | null;
  /**
   * The picture shown with the headline. For the news cards this is an
   * Unsplash photo chosen by topic (lib/newsImages.ts), never the
   * publisher's own picture, which is licensed to them, not to us. What the
   * feed itself offers is read here but replaced there.
   */
  image: string | null;
};

const TIMEOUT_MS = 6000;

/** SEC asks for a descriptive agent with a contact address; the rest don't mind. */
const USER_AGENT = "CongTrade/1.0 (+https://www.congtrade.com; contact@congtrade.com)";

/** The handful of named entities these feeds use; the rest arrive numeric. */
const NAMED: Record<string, string> = {
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  rsquo: "\u2019",
  lsquo: "\u2018",
  ldquo: "\u201c",
  rdquo: "\u201d",
  mdash: "\u2014",
  ndash: "\u2013",
  hellip: "\u2026",
};

function decode(raw: string): string {
  return (
    raw
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, "")
      // Numeric first, and both bases: feeds write curly quotes as &#x2019;
      // or &#8217;, and a headline rendered with the escape still in it looks
      // like the parser gave up halfway.
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeChar(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => safeChar(parseInt(dec, 10)))
      .replace(/&([a-z]+);/gi, (match, name: string) => NAMED[name.toLowerCase()] ?? match)
      // Ampersand last, so a doubly-escaped entity resolves rather than
      // turning into a stray & mid-word.
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** An out-of-range code point means a malformed feed, not a reason to throw. */
function safeChar(code: number): string {
  if (!Number.isFinite(code) || code < 1 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

function tag(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"));
  return m ? decode(m[1]) : null;
}

function isoDate(raw: string | null): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** media:content and media:thumbnail carry it; enclosure is the older form. */
function image(block: string): string | null {
  const media = block.match(/<media:(?:content|thumbnail)[^>]*url="([^"]+)"/i);
  if (media) return media[1];
  const enclosure = block.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image\//i);
  return enclosure ? enclosure[1] : null;
}

/** RSS puts the link in a text node; Atom puts it in an attribute. */
function link(block: string): string | null {
  const rss = tag(block, "link");
  if (rss && /^https?:/i.test(rss)) return rss;
  const atom = block.match(/<link[^>]*href="([^"]+)"/i);
  return atom ? atom[1] : null;
}

/** Parses both formats, because BLS serves Atom where the others serve RSS. */
export function parseFeed(xml: string, source: string): FeedItem[] {
  const blocks = [
    ...(xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? []),
    ...(xml.match(/<entry(?:\s[^>]*)?>[\s\S]*?<\/entry>/gi) ?? []),
  ];
  const items: FeedItem[] = [];
  for (const block of blocks) {
    const title = tag(block, "title");
    const url = link(block);
    if (!title || !url) continue;
    items.push({
      title,
      url,
      source,
      publishedAt: isoDate(tag(block, "pubDate") ?? tag(block, "published") ?? tag(block, "updated")),
      image: image(block),
    });
  }
  return items;
}

/**
 * One feed's items, newest first.
 *
 * Never throws: a timeout, a 500 or a page of HTML all come back as an empty
 * list, and that empty list is not cached, so the next render tries again.
 *
 * Cached for half an hour as the few items kept, not as the feed itself: on
 * Vercel every cache write counts as ISR writes in 8 KB units, and a whole
 * RSS document (tens of KB, every item's full text) rewritten every half hour
 * for each feed cost many times what its handful of headlines does.
 */
export async function fetchFeed(url: string, source: string, { limit = 10 }: { limit?: number } = {}): Promise<FeedItem[]> {
  try {
    return await cachedFeed(url, source, limit);
  } catch {
    return [];
  }
}

const cachedFeed = unstable_cache(
  async (url: string, source: string, limit: number): Promise<FeedItem[]> => {
    // Not cached by fetch itself (Next 15 does not by default): only the
    // items returned here are.
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`${url} answered ${res.status}`);
    const items = parseFeed(await res.text(), source);
    // A page of HTML served with a 200 parses to nothing; not worth keeping.
    if (!items.length) throw new Error(`${url} had no items`);
    items.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
    return items.slice(0, limit);
  },
  ["feed-items-v2"],
  { revalidate: 1800 }
);
