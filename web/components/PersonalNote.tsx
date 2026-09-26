import Image from "next/image";

/**
 * A word from whoever is behind CongTrade, on the page that asks for a card.
 *
 * The portrait is a licensed stock photograph, and says so in the caption
 * rather than in a file nobody reads. That disclosure is not decoration: this
 * is a site whose entire argument is that every figure on it links back to a
 * document you can check yourself, and a face presented as the author's when
 * it isn't would be the one unverifiable thing on the page — the exact
 * objection the note is meant to answer. Labelled, it is an illustration.
 * Unlabelled, it would be a small lie told next to a payment form.
 *
 * `name` is the one thing the copy can't supply: sign it, and the note stops
 * being from "the person behind CongTrade" and starts being from someone.
 */
export function PersonalNote({ name }: { name?: string }) {
  return (
    <section className="rounded-xl border border-line bg-panel p-5 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:gap-6">
        <figure className="shrink-0">
          <Image
            src="/stock-portrait.jpg"
            alt=""
            width={426}
            height={640}
            sizes="96px"
            className="h-24 w-24 rounded-full object-cover object-top sm:h-28 sm:w-28"
          />
          <figcaption className="mt-2 max-w-[7rem] text-[10px] leading-tight text-ink-faint">
            Stock photograph, not the author.
          </figcaption>
        </figure>

        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">Why I built this</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
            Members of Congress have to disclose what they trade, and they do — as a PDF, filed weeks after the fact, on
            a government site almost nobody visits. The information has been public the whole time and almost nobody
            could use it. That gap is the entire reason CongTrade exists.
          </p>
          <p className="mt-2.5 text-[13px] leading-relaxed text-ink-muted">
            It&apos;s an independent project. No investors, nobody paying to have a position talked up, no view on what
            any of these trades mean. Pro pays for the pipeline that reads every filing every four hours — the data
            itself stays open to everyone, and every row links back to the document it came from, so you never have to
            take my word for any of it.
          </p>
          <p className="mt-2.5 text-[13px] leading-relaxed text-ink-muted">
            If a figure ever looks wrong, tell me:{" "}
            <a
              href="mailto:contact@congtrade.com"
              className="text-ink underline decoration-line-strong hover:decoration-current"
            >
              contact@congtrade.com
            </a>
            .
          </p>
          <p className="mt-3 text-xs text-ink-faint">— {name ?? "the person behind CongTrade"}</p>
        </div>
      </div>
    </section>
  );
}
