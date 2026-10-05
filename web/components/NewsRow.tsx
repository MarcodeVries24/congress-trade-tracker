"use client";

import { useEffect, useState } from "react";
import Link from "@/components/Link";
import type { NewsSection } from "@/lib/newsFeed";
import { NewsCard } from "./NewsCard";

/**
 * One desk's headlines as a row of blocks.
 *
 * Used twice on the home page — markets between the trading panels, economy
 * below the chart — so the two read as the same kind of thing in two places
 * rather than as two different treatments of the same feed.
 *
 * Both instances fetch /api/news; the second is served from the browser's own
 * cache, so it costs a cache lookup rather than a request.
 */
export function NewsRow({
  sectionKey,
  title,
  showAllLink = false,
}: {
  sectionKey: string;
  title: string;
  showAllLink?: boolean;
}) {
  const [section, setSection] = useState<NewsSection | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/news")
      .then((r) => (r.ok ? r.json() : { sections: [] }))
      .then((d: { sections: NewsSection[] }) => {
        if (!cancelled) setSection(d.sections?.find((s) => s.key === sectionKey) ?? null);
      })
      .catch(() => {
        if (!cancelled) setSection(null);
      });
    return () => {
      cancelled = true;
    };
  }, [sectionKey]);

  // Nothing rather than an empty shell when the publisher is unreachable.
  if (section === null) return null;

  return (
    <section className="mt-4 lg:mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-base font-bold tracking-tight text-ink">
          {title}{" "}
          {section && (
            <span className="text-xs font-normal text-ink-faint">
              · {section.publisher} {section.blurb.toLowerCase()}
            </span>
          )}
        </h2>
        {showAllLink && (
          <Link href="/news" className="text-xs text-accent hover:underline">
            All news →
          </Link>
        )}
      </div>

      <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {section
          ? section.items.slice(0, 4).map((item) => <NewsCard key={item.url} item={item} />)
          : Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="h-48 animate-pulse rounded-lg border border-line bg-panel" aria-hidden />
            ))}
      </div>
    </section>
  );
}
