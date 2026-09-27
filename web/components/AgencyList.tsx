import type { FeedItem } from "@/lib/feeds";

/**
 * The agency releases as a list rather than as cards.
 *
 * None of these feeds carry a picture, and a grid of card-shaped blocks with
 * nothing in the picture half is a grid pretending to be illustrated. A list
 * also suits what they are: dated notices from five bodies, read by scanning
 * the source column, not browsed.
 */
export function AgencyList({ items }: { items: FeedItem[] }) {
  if (items.length === 0) return null;

  return (
    <ul className="mt-3 divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel">
      {items.map((item) => (
        <li key={item.url}>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col gap-1 px-4 py-3 transition-colors hover:bg-panel-muted sm:flex-row sm:items-baseline sm:gap-4 sm:px-5"
          >
            <span className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-accent sm:w-36">
              {item.source}
            </span>
            <span className="min-w-0 flex-1 text-sm leading-snug text-ink group-hover:text-accent">{item.title}</span>
            <span className="shrink-0 text-[11px] text-ink-faint sm:w-24 sm:text-right">
              {item.publishedAt
                ? new Date(item.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                : ""}
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}
