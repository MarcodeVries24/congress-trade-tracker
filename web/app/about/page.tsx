"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { fetchStats, Stats, VOLUME_ESTIMATE_NOTE } from "@/lib/api";
import { compactUSD, formatDateFromTimestamp } from "@/lib/format";

const FAQ: { q: string; a: string }[] = [
  {
    q: "What is a Periodic Transaction Report (PTR)?",
    a: "Under the STOCK Act of 2012, members of the U.S. House and Senate (and senior staff) must publicly disclose most securities transactions over $1,000 within 45 days of the trade, using a standard form called a Periodic Transaction Report. CongTrade collects, parses, and republishes these disclosures in a searchable, filterable format.",
  },
  {
    q: "Why don't trades show an exact dollar amount?",
    a: 'The law only requires a member to disclose which bracket a trade falls into: "$1,001–$15,000," "$50,001–$100,000," and so on, up through "Over $50,000,000." It never requires the exact figure. CongTrade always shows the disclosed range as filed. Where a single number is more useful, such as the "Est. volume" figure on the dashboard, we use the midpoint of that range and label it clearly as an estimate.',
  },
  {
    q: "How often is the data updated?",
    a: 'CongTrade is updated daily. We check the House Clerk\'s and Senate\'s disclosure systems for newly filed PTRs, and every new filing is reviewed before it is published. The "Last updated" date shown across the site is when new filings last went live.',
  },
  {
    q: "Is CongTrade an official government site?",
    a: "No. CongTrade is an independent, unofficial project. It is not affiliated with, endorsed by, sponsored by, or operated on behalf of the U.S. Congress, the House Clerk, the Senate, or any government agency. All underlying disclosure data is public record produced by the government; CongTrade only collects, parses, and presents it.",
  },
  {
    q: "Can I trust the numbers?",
    a: "We aim for high accuracy. Most filings are parsed straight from the document's own text. A minority arrive as scans of hand-filled paper forms, and rather than trust a machine reading of those, every one of them has been checked against the scan by hand. Anything that still can't be read with confidence is left blank and logged rather than guessed at, and every trade links to the original document so you can check it yourself.",
  },
  {
    q: "How do I check a trade against the original filing?",
    a: "Every trade on CongTrade links back to its source document (the PDF for House filings, the report page for Senate filings) directly from the trade row, so you can compare our parsed data against the government's own filing at any time.",
  },
  {
    q: "Is this investment advice?",
    a: "No. Nothing on CongTrade is financial, investment, legal, or tax advice, and the fact that a member of Congress traded a security is not a recommendation or endorsement of it. See our Terms of Service for the full detail.",
  },
  {
    q: "I found an error, or have a question. Who do I contact?",
    a: "Email contact@congtrade.com. Corrections, questions about methodology, and general feedback are all welcome, and we look into every report.",
  },
];

const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};

export default function AboutPage() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetchStats(["house", "senate"]).then(setStats).catch(() => {});
  }, []);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(FAQ_JSON_LD) }} />
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">About CongTrade</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-muted sm:text-base">
          CongTrade is an independent, searchable archive of stock and asset trades disclosed by members of the U.S.
          House and Senate, built directly from their own government filings, not a third-party data feed.
        </p>

        {stats && (
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-line bg-panel px-4 py-2.5 text-xs text-ink-muted sm:text-sm">
            <AboutStat value={stats.totalTransactions.toLocaleString()} label="Transactions" />
            <AboutStatDivider />
            <AboutStat value={compactUSD.format(stats.estimatedVolume)} label="Est. volume" hint={VOLUME_ESTIMATE_NOTE} />
            <AboutStatDivider />
            <AboutStat value={stats.totalFilings.toLocaleString()} label="Filings" />
            <AboutStatDivider />
            <AboutStat value={stats.totalMembers.toLocaleString()} label="Members covered" />
            <AboutStatDivider />
            <AboutStat
              value={formatDateFromTimestamp(stats.lastUpdatedAt ?? stats.lastCheckedAt ?? stats.lastIngestedAt)}
              label="Last updated"
            />
          </div>
        )}

        <div className="mt-10 space-y-8">
          <Section title="What is a Periodic Transaction Report?">
            <p>
              The STOCK Act of 2012 requires members of Congress, and senior staff, to publicly report most
              securities transactions (stocks, bonds, options, and similar assets) worth more than $1,000, within
              45 days of the trade. That disclosure is filed on a standard form called a{" "}
              <strong className="text-ink">Periodic Transaction Report</strong>, or PTR. It's the same underlying
              document behind every row on this site.
            </p>
          </Section>

          <Section title="Where the data comes from">
            <p>
              House PTRs are filed as PDFs with the Office of the Clerk. CongTrade downloads the Clerk&rsquo;s public
              filing index directly and parses each PDF&rsquo;s transaction table: asset, ticker, buy or sell, dates,
              and disclosed amount range.
            </p>
            <p>
              Senate PTRs are filed with the Office of Public Records. Electronic filings are parsed straight from
              their HTML transaction table. A portion of both chambers&rsquo; filings, mostly hand-delivered paper
              forms, arrive as scans with no text in them at all. Those are transcribed and then verified against
              the scan by hand, line by line, before they join the rest.
            </p>
            <p>
              Member photos and party affiliation come from the public{" "}
              <a
                href="https://github.com/unitedstates/congress-legislators"
                target="_blank"
                rel="noreferrer"
                className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted"
              >
                unitedstates/congress-legislators
              </a>{" "}
              dataset. Ticker market caps, where shown, are resolved and updated monthly.
            </p>
          </Section>

          <Section title="How dollar amounts are estimated">
            <p>
              The STOCK Act only requires a member to disclose which bracket a trade&rsquo;s value falls into, from
              &ldquo;$1,001&ndash;$15,000&rdquo; up to &ldquo;Over $50,000,000&rdquo;, never an exact figure.
              CongTrade always shows that disclosed range as filed. Where a single number is more useful for
              comparison, like the total &ldquo;Est. volume&rdquo; figure shown on the dashboard and on each
              member&rsquo;s profile, we take the midpoint of the disclosed range and sum it across trades, and
              label it as an estimate everywhere it appears.
            </p>
          </Section>

          <Section title="How often the data updates">
            <p>
              CongTrade is updated daily. An automated pipeline checks the House Clerk&rsquo;s and Senate&rsquo;s
              disclosure systems for newly filed PTRs, and every new filing is reviewed before it is published.
              The &ldquo;Last updated&rdquo; date in the stat strip above, and elsewhere across the site, is when
              new filings last went live.
            </p>
          </Section>

          <Section title="Data quality and limitations">
            <p>We&rsquo;d rather show you nothing than show you a guess. In practice that means:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                Every trade links to the document it came from, wherever it appears, so any figure here can be read
                back against the filing itself.
              </li>
              <li>A line the parser can&rsquo;t confidently match to an asset, amount, or date is logged and left out rather than guessed at.</li>
              <li>Dates are stored exactly as filed, even on the rare filing with an internal typo; we don&rsquo;t silently correct the source document.</li>
              <li>Company names, tickers, and market caps are matched programmatically and can occasionally be wrong or missing.</li>
            </ul>
            <p>
              Every trade links back to its source filing directly, so you can verify anything load-bearing against
              the original document yourself. See the{" "}
              <a href="/terms" className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted">
                Terms of Service
              </a>{" "}
              for the full accuracy disclaimer.
            </p>
          </Section>

          <Section title="Who runs CongTrade">
            <p>
              CongTrade is built and maintained independently. It isn&rsquo;t funded by, affiliated with, or run on
              behalf of any political party, campaign, PAC, member of Congress, or government body. It exists to
              make disclosures that are already public record easier to search and cross-reference. See the{" "}
              <a href="/privacy" className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted">
                Privacy Policy
              </a>{" "}
              for how the site itself handles data.
            </p>
          </Section>

          <Section title="Frequently asked questions">
            <div className="space-y-1">
              {FAQ.map(({ q, a }) => (
                <details key={q} className="group border-b border-line py-3 first:pt-0 last:border-b-0">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-ink marker:content-none">
                    {q}
                    <span className="shrink-0 text-ink-faint transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{a}</p>
                </details>
              ))}
            </div>
          </Section>

          <Section title="Contact" id="contact">
            <p>
              Questions, corrections, or feedback, whether about a specific trade, the data pipeline, legal or
              privacy matters, or anything else, can be sent to{" "}
              <a href="mailto:contact@congtrade.com" className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted">
                contact@congtrade.com
              </a>
              .
            </p>
          </Section>
        </div>
      </main>
      <Footer />
    </>
  );
}

function Section({ title, id, children }: { title: string; id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={id ? "scroll-mt-20" : undefined}>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <div className="mt-2 space-y-2.5 text-sm leading-relaxed text-ink-muted">{children}</div>
    </section>
  );
}

function AboutStat({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <span className="whitespace-nowrap" title={hint}>
      <span className="font-semibold text-ink">{value}</span> {label}
    </span>
  );
}

function AboutStatDivider() {
  return <span className="hidden text-ink-faint/50 sm:inline">·</span>;
}
