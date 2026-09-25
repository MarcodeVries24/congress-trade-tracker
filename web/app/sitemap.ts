import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

/**
 * Every indexable page. /account and /unsubscribe are omitted on purpose —
 * both are `noindex`, and listing a page you've asked not to be indexed is a
 * contradiction search engines resolve by trusting neither signal.
 *
 * It is a short list, and that is the honest state of the site: seven URLs for
 * an archive of 65,000+ transactions across 291 members, because the data is
 * reached through filters on one page rather than through pages of its own.
 * Per-member pages would turn one thin URL into a few hundred substantial
 * ones; until then this lists what genuinely exists.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/trades`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/politicians`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/upgrade`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];
}
