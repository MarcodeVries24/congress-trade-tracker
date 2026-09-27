"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { NewsSection } from "@/lib/newsFeed";
import { NewsCard } from "./NewsCard";

/**
 * Other people's journalism, under their own name, kept clearly apart from
 * the agency releases above it.
 *
 * Four per publisher on the home page, the rest on /news. Each block leaves
 * for the publisher; nothing is summarised or re-hosted here.
 */
export function GeneralNews() {
  const [sections, setSections] = useState<NewsSection[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/news")
      .then((r) => (r.ok ? r.json() : { sections: [] }))
      .then((d: { sections: NewsSection[] }) => {
        if (!cancelled) setSections(d.sections ?? []);
      })
      .catch(() => {
        if (!cancelled) setSections([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (sections !== null && sections.length === 0) return null;

  return (
    <section className="mt-4 lg:mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-base font-bold tracking-tight text-ink">Markets and economy</h2>
        <Link href="/news" className="text-xs text-accent hover:underline">
          All news →
        </Link>
      </div>

      {(sections ?? []).map((section, i) => (
        <div key={section.key} className={i === 0 ? "mt-3" : "mt-6"}>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className="text-sm font-semibold text-ink">{section.publisher}</h3>
            <span className="text-[11px] text-ink-faint">{section.blurb}</span>
          </div>
          <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {section.items.map((item) => (
              <NewsCard key={item.url} item={item} accent={section.key === "cnbc" ? "accent" : "amber"} />
            ))}
          </div>
        </div>
      ))}

      {sections === null && (
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-hidden>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-48 animate-pulse rounded-lg border border-line bg-panel" />
          ))}
        </div>
      )}
    </section>
  );
}
