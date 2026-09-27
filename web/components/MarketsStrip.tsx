"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { NewsSection } from "@/lib/newsFeed";

/**
 * CNBC's markets desk as one wide band, four across.
 *
 * Sits between the trading panels rather than under them: it's the market the
 * trades above were made into, so it reads as context in place rather than as
 * an afterthought at the foot of the page.
 *
 * Kept short on purpose — a thumbnail and a headline, no standfirst. This is
 * a strip between two sections of the site's own data, not a homepage for
 * somebody else's journalism.
 */
export function MarketsStrip() {
  const [section, setSection] = useState<NewsSection | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/news")
      .then((r) => (r.ok ? r.json() : { sections: [] }))
      .then((d: { sections: NewsSection[] }) => {
        if (cancelled) return;
        setSection(d.sections?.find((s) => s.key === "cnbc-markets") ?? null);
      })
      .catch(() => {
        if (!cancelled) setSection(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Nothing at all when CNBC is unreachable: a headed band with four empty
  // slots looks broken in a way a missing band doesn't.
  if (section === null) return null;

  return (
    <section className="mt-4 overflow-hidden rounded-lg border border-line bg-panel lg:mt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold text-ink">
          Markets today <span className="font-normal text-ink-faint">· CNBC</span>
        </h2>
        <Link href="/news" className="text-xs text-accent hover:underline">
          All news →
        </Link>
      </div>

      <div className="grid grid-cols-1 divide-y divide-line sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
        {(section?.items ?? Array.from({ length: 4 }, () => null)).slice(0, 4).map((item, i) => (
          <div key={item?.url ?? i} className="sm:border-b sm:border-line lg:border-b-0">
            {item ? (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="group flex h-full items-start gap-3 px-4 py-3.5 transition-colors hover:bg-panel-muted sm:px-5"
              >
                {item.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- served
                  // by CNBC, not re-hosted here; see lib/articleImage.ts.
                  <img
                    src={item.image}
                    alt=""
                    loading="lazy"
                    className="h-14 w-20 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span className="h-14 w-20 shrink-0 rounded bg-panel-muted" aria-hidden />
                )}
                <span className="min-w-0">
                  <span className="line-clamp-3 text-[13px] font-medium leading-snug text-ink group-hover:text-accent">
                    {item.title}
                  </span>
                  {item.publishedAt && (
                    <span className="mt-1 block text-[11px] text-ink-faint">
                      {new Date(item.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  )}
                </span>
              </a>
            ) : (
              <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5" aria-hidden>
                <span className="h-14 w-20 shrink-0 animate-pulse rounded bg-line" />
                <span className="flex-1 space-y-1.5 pt-1">
                  <span className="block h-3 w-full animate-pulse rounded bg-line" />
                  <span className="block h-3 w-2/3 animate-pulse rounded bg-line" />
                </span>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
