"use client";

import { useEffect, useState } from "react";
import type { FeedItem } from "@/lib/feeds";

/**
 * What Congress is trading around: the latest release from each of five
 * federal agencies.
 *
 * Headlines and links only, each going straight to the agency that published
 * it. That is the whole design. A licensed wire feed would have cost money
 * and given every visitor the same commodity text they can read anywhere;
 * these are US federal works, free of copyright, and they are the releases
 * that actually move the disclosures on the rest of this page.
 *
 * No thumbnails, because none of these feeds carry one. An invented
 * illustration next to a CPI print would be decoration pretending to be
 * evidence, on a site that argues everything it shows can be checked.
 */
function relativeDay(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const days = Math.round((Date.now() - then.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function PolicyStrip() {
  const [items, setItems] = useState<FeedItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/policy")
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d: { items: FeedItem[] }) => {
        if (!cancelled) setItems(d.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Renders nothing at all rather than an empty shell: every agency being
  // unreachable at once is possible, and a headed box with no headlines looks
  // broken in a way that a missing section doesn't.
  if (items !== null && items.length === 0) return null;

  return (
    <section className="rounded-lg border border-line bg-panel">
      <div className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold text-ink">News from the agencies</h2>
        <p className="text-[11px] text-ink-faint">Official releases, unedited</p>
      </div>

      <ul className="divide-y divide-line">
        {(items ?? Array.from({ length: 5 }, () => null)).map((item, i) => (
          <li key={item?.url ?? i}>
            {item ? (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-panel-muted sm:flex-row sm:items-baseline sm:gap-4 sm:px-5"
              >
                <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-accent sm:w-36">
                  {item.source}
                </span>
                <span className="min-w-0 flex-1 text-sm leading-snug text-ink group-hover:text-accent">
                  {item.title}
                </span>
                <span className="shrink-0 text-[11px] text-ink-faint sm:w-20 sm:text-right">
                  {relativeDay(item.publishedAt)}
                </span>
              </a>
            ) : (
              <div className="flex items-center gap-4 px-4 py-3 sm:px-5" aria-hidden>
                <span className="h-3 w-28 animate-pulse rounded bg-line" />
                <span className="h-3 flex-1 animate-pulse rounded bg-line" />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
