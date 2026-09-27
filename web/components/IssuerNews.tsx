import type { FeedItem } from "@/lib/feeds";
import { formatDateFromTimestamp } from "@/lib/format";

/**
 * Recent headlines about the company whose page this is.
 *
 * Below the trades, never above them: someone arrived here to see who in
 * Congress traded this company, and the news is background to that. Headline
 * and link only, each one leaving for the publisher that wrote it.
 */
export function IssuerNews({ items, name }: { items: FeedItem[]; name: string }) {
  if (items.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold text-ink">Recent {name} headlines</h2>
        <p className="text-[11px] text-ink-faint">From Yahoo Finance. Not CongTrade data.</p>
      </div>

      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel">
        {items.map((item) => (
          <li key={item.url}>
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="group flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-panel-muted sm:flex-row sm:items-baseline sm:justify-between sm:gap-4"
            >
              <span className="min-w-0 text-sm leading-snug text-ink group-hover:text-accent">{item.title}</span>
              <span className="shrink-0 text-[11px] text-ink-faint">
                {item.publishedAt ? formatDateFromTimestamp(item.publishedAt) : ""}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
