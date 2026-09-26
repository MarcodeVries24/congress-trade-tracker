/**
 * The objections, answered on the page rather than in a support email.
 *
 * Also the only substantial text on /upgrade, which until now was a heading
 * and one sentence — a pricing page with nothing to read ranks for nothing
 * and reassures nobody. Emitted as FAQPage structured data as well, so the
 * answers can show up in the search result itself.
 */
const FAQS: { q: string; a: string }[] = [
  {
    q: "Where does the data come from?",
    a: "Straight from the members themselves. Every US Representative and Senator has to file a Periodic Transaction Report for each trade, with the House Clerk or the Senate's eFD system. CongTrade reads those filings and links every trade back to the original PDF, so you can always check our work against the source.",
  },
  {
    q: "How quickly does a new trade show up?",
    a: "We check both chambers every four hours, so a filing is usually on the site the same day it's published. The bigger delay isn't ours: the law gives members up to 45 days after a trade to file it, so a disclosure you see today may describe a trade from weeks ago. Both dates are shown on every row.",
  },
  {
    q: "Why are the amounts ranges rather than exact figures?",
    a: "Because that's all members disclose. A filing says a trade was worth $15,001–$50,000, never $31,240. Where CongTrade shows a total, it adds up the midpoint of each range — a reasonable estimate, and clearly not a precise number.",
  },
  {
    q: "What can I do without paying?",
    a: "Search and browse everything: every trade, every member, every issuer, all the way back through the archive. Pro adds the filters, the email alerts and an ad-free view. The underlying data isn't held back from anyone.",
  },
  {
    q: "What exactly do the filters add?",
    a: "They narrow the same data by member, ticker, party, state, chamber, trade type, owner, trade size, market-cap tier and filing date, in any combination — and the URL keeps them, so a view you build is a link you can save or share.",
  },
  {
    q: "Can I cancel?",
    a: "Any time, from your account page. No email, no cancellation flow to sit through.",
  },
  {
    q: "Is this investment advice?",
    a: "No. CongTrade reports what has been disclosed, nothing more. What you make of it is yours.",
  },
];

export function UpgradeFaq() {
  return (
    <section className="mt-14">
      <h2 className="text-lg font-bold tracking-tight text-ink">Questions</h2>
      <div className="mt-4 divide-y divide-line rounded-xl border border-line bg-panel">
        {FAQS.map(({ q, a }) => (
          <details key={q} className="group px-5 py-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-ink marker:content-['']">
              {q}
              <span
                aria-hidden
                className="shrink-0 text-ink-faint transition-transform group-open:rotate-45"
              >
                +
              </span>
            </summary>
            <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-ink-muted">{a}</p>
          </details>
        ))}
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: FAQS.map(({ q, a }) => ({
              "@type": "Question",
              name: q,
              acceptedAnswer: { "@type": "Answer", text: a },
            })),
          }),
        }}
      />
    </section>
  );
}
