/**
 * Who CongTrade is, on the page that asks for a card. Text only: no portrait.
 */
export function PersonalNote() {
  return (
    <section className="rounded-xl border border-line bg-panel p-5 sm:p-6">
      <h2 className="text-sm font-semibold text-ink">Why we built CongTrade</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-muted">
        Members of Congress have to disclose what they trade, and they do, as a PDF filed weeks after the fact, on
        a government site almost nobody visits. The information has been public the whole time and almost nobody
        could use it. That gap is the entire reason CongTrade exists.
      </p>
      <p className="mt-2.5 text-[13px] leading-relaxed text-ink-muted">
        We&apos;re an independent project. No investors, nobody paying us to have a position talked up, no view on
        what any of these trades mean. Pro pays for the pipeline that reads and checks every filing, every day. The data
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
    </section>
  );
}
