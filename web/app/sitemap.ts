import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";
import { getMemberDirectory } from "@/lib/members";
import { getIssuerDirectory } from "@/lib/issuers";

/**
 * Every indexable page: eight fixed routes, one per member who has traded, and
 * one per company they traded.
 *
 * Both lists come from a query, not a list, which is what makes this
 * self-maintaining — a politician filing for the first time, or a ticker
 * nobody has traded before, appears here on the next revalidation without
 * anyone touching the code.
 *
 * /account and /unsubscribe are omitted on purpose: both are `noindex`, and
 * listing a page you've asked not to be indexed is a contradiction search
 * engines resolve by trusting neither signal.
 */

// Rebuilt at most hourly. The member list changes only when the ingest finds a
// filing from someone new, which is rare — no reason to run ~300 rows of
// aggregation on every crawler request.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const fixed: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/trades`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/politicians`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/issuers`, lastModified: now, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/upgrade`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
  ];

  let members: MetadataRoute.Sitemap = [];
  try {
    members = (await getMemberDirectory()).map((m) => ({
      url: `${SITE_URL}/politicians/${m.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
  } catch {
    // A sitemap listing the fixed routes beats a 500 that tells Google the
    // whole file is broken, so a database blip degrades rather than fails.
  }

  let issuers: MetadataRoute.Sitemap = [];
  try {
    issuers = (await getIssuerDirectory()).map((i) => ({
      url: `${SITE_URL}/issuers/${i.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    }));
  } catch {
    // Same reasoning as the member list above: degrade, don't 500.
  }

  return [...fixed, ...members, ...issuers];
}
