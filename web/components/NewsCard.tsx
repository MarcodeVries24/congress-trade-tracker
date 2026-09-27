import type { FeedItem } from "@/lib/feeds";

/**
 * One headline as a block.
 *
 * The publisher's name is set as type rather than drawn as its logo. A
 * masthead sitting on someone else's site reads as a partnership, and these
 * are feeds we consume, not deals we have; the name identifies the source,
 * which is the whole job. Swapping in real marks later is a component change,
 * not a rewrite.
 *
 * Where a feed offers a picture it is loaded from the publisher's own server
 * and the card links back to them, which is what a media element in a public
 * feed is published for. Where it doesn't, the card falls back to type on a
 * tint rather than leaving a grey hole.
 */
export function NewsCard({ item, accent = "accent" }: { item: FeedItem; accent?: "accent" | "amber" }) {
  const stripe = accent === "amber" ? "text-amber-500" : "text-accent";

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="group flex flex-col overflow-hidden rounded-lg border border-line bg-panel transition-colors hover:border-line-strong"
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-panel-muted">
        {item.image ? (
          // eslint-disable-next-line @next/next/no-img-element -- hotlinked
          // from the publisher rather than pulled through our own optimizer,
          // which would mean re-hosting their picture on our domain.
          <img
            src={item.image}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className={`text-sm font-semibold uppercase tracking-[0.2em] ${stripe} opacity-50`}>
              {item.source}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 px-4 py-3.5">
        <div className="flex items-center gap-2 text-[11px]">
          <span className={`font-semibold uppercase tracking-wide ${stripe}`}>{item.source}</span>
          {item.publishedAt && (
            <span className="text-ink-faint">
              {new Date(item.publishedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </span>
          )}
        </div>
        <h3 className="text-sm font-medium leading-snug text-ink group-hover:text-accent">{item.title}</h3>
      </div>
    </a>
  );
}
