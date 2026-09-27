/**
 * The picture a page offers for sharing, read from its own og:image tag.
 *
 * CNBC publishes no media element in any of its feeds — fourteen sections
 * checked, none — but every article carries the Open Graph tag that exists so
 * other sites can render a preview. This reads exactly that, and only that.
 *
 * Deliberately frugal: the tag lives in <head>, articles run to 800KB, so the
 * body is read in chunks and dropped the moment the tag turns up or the cap
 * is reached. Whole articles are never held in memory and never cached.
 */
const HEAD_BYTES = 64 * 1024;
const TIMEOUT_MS = 4000;
const TTL_MS = 6 * 60 * 60 * 1000;
const MAX_ENTRIES = 500;

const cache = new Map<string, { at: number; image: string | null }>();

const OG = [
  /<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i,
  /<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i,
  /<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i,
];

export async function articleImage(pageUrl: string): Promise<string | null> {
  const hit = cache.get(pageUrl);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.image;

  const image = await read(pageUrl);
  // Oldest out first. A Map iterates in insertion order, so the first key is
  // the stalest, and this only has to stop the map growing without bound on a
  // long-running server.
  if (cache.size >= MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(pageUrl, { at: Date.now(), image });
  return image;
}

async function read(pageUrl: string): Promise<string | null> {
  if (!/^https:\/\//i.test(pageUrl)) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let found: string | null = null;
  try {
    const res = await fetch(pageUrl, {
      headers: { "user-agent": "CongTrade/1.0 (+https://www.congtrade.com; contact@congtrade.com)", accept: "text/html" },
      signal: controller.signal,
    });
    if (!res.ok || !res.body) return null;

    const decoder = new TextDecoder();
    let head = "";
    // `break`, never `return`, and the abort waits for the finally below.
    // Aborting mid-loop makes the iterator's own cleanup reject, and that
    // rejection lands in this catch — which quietly threw away a tag that had
    // already been found. It cost an afternoon once; it won't twice.
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      head += decoder.decode(chunk, { stream: true });
      found = match(head);
      if (found || head.length >= HEAD_BYTES) break;
    }
  } catch {
    // A dropped connection after the tag was matched still counts as a hit.
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
  return found;
}

function match(html: string): string | null {
  for (const pattern of OG) {
    const m = html.match(pattern);
    if (m && /^https:\/\//i.test(m[1])) return m[1];
  }
  return null;
}
