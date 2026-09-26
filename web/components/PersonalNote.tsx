import Image from "next/image";

/**
 * Who CongTrade is, on the page that asks for a card.
 *
 * Note for whoever edits this next: the portrait is a licensed stock
 * photograph and is not a photograph of anyone at CongTrade. It carries no
 * name, role or quote, and it must not be given one: a stock face over a
 * real-sounding name is a fabricated person, which is a different thing
 * entirely from an illustration.
 */
export function PersonalNote() {
  return (
    <section className="rounded-xl border border-line bg-panel p-5 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:gap-6">
        <div className="shrink-0">
          <Image
            src="/stock-portrait.jpg"
            alt=""
            width={426}
            height={640}
            sizes="160px"
            className="h-32 w-32 rounded-full object-cover object-top sm:h-40 sm:w-40"
          />
        </div>

        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">Why we built CongTrade</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
            Members of Congress have to disclose what they trade, and they do, as a PDF filed weeks after the fact, on
            a government site almost nobody visits. The information has been public the whole time and almost nobody
            could use it. That gap is the entire reason CongTrade exists.
          </p>
          <p className="mt-2.5 text-[13px] leading-relaxed text-ink-muted">
            We&apos;re an independent project. No investors, nobody paying us to have a position talked up, no view on
            what any of these trades mean. Pro pays for the pipeline that reads every filing every four hours. The data
            itself stays open to everyone, and every row links back to the document it came from, so you never have to
            take our word for any of it.
          </p>
          <p className="mt-2.5 text-[13px] leading-relaxed text-ink-muted">
            If a figure ever looks wrong, tell us:{" "}
            <a
              href="mailto:contact@congtrade.com"
              className="text-ink underline decoration-line-strong hover:decoration-current"
            >
              contact@congtrade.com
            </a>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
