"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { fetchStats, Stats } from "@/lib/api";
import { compactUSD, formatDateFromTimestamp, formatTimeWithZone } from "@/lib/format";

const FAQ: { q: string; a: string }[] = [
  {
    q: "What is a Periodic Transaction Report (PTR)?",
    a: "Under the STOCK Act of 2012, members of the U.S. House and Senate (and senior staff) must publicly disclose most securities transactions over $1,000 within 45 days of the trade, using a standard form called a Periodic Transaction Report. CongTrade collects, parses, and republishes these disclosures in a searchable, filterable format.",
  },
  {
    q: "Why don't trades show an exact dollar amount?",
    a: 'The law only requires a member to disclose which bracket a trade falls into — "$1,001–$15,000," "$50,001–$100,000," and so on, up through "Over $50,000,000" — not the exact figure. CongTrade always shows the disclosed range as filed. Where a single number is more useful, such as the "Est. volume" figure on the dashboard, we use the midpoint of that range and label it clearly as an estimate.',
  },
  {
    q: "How often is the data updated?",
    a: 'An automated pipeline checks the House Clerk\'s and Senate\'s disclosure systems every 4 hours and ingests any newly filed PTRs it finds. The "Last checked" timestamp shown across the site reflects the most recent of these runs.',
  },
  {
    q: "Is CongTrade an official government site?",
    a: "No. CongTrade is an independent, unofficial project. It is not affiliated with, endorsed by, sponsored by, or operated on behalf of the U.S. Congress, the House Clerk, the Senate, or any government agency. All underlying disclosure data is public record produced by the government — CongTrade only collects, parses, and presents it.",
  },
  {
    q: "Can I trust the numbers?",
    a: 'We aim for high accuracy, but a meaningful share of filings — hand-filed paper forms, in particular — are scanned images that have to be read with optical character recognition (OCR) rather than extracted as text, which is inherently less certain. Rows recovered this way carry a visible "OCR" badge that links straight back to the original scan, so you can check the source yourself. Anything the parser can\'t confidently read is left blank and logged rather than guessed at.',
  },
  {
    q: "How do I check a trade against the original filing?",
    a: "Every trade on CongTrade links back to its source document — the PDF for House filings, the report page for Senate filings — directly from the trade row, so you can compare our parsed data against the government's own filing at any time.",
  },
  {
    q: "Is this investment advice?",
    a: "No. Nothing on CongTrade is financial, investment, legal, or tax advice, and the fact that a member of Congress traded a security is not a recommendation or endorsement of it. See our Terms of Service for the full detail.",
  },
  {
    q: "I found an error, or have a question — who do I contact?",
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
          House and Senate — built directly from their own government filings, not a third-party data feed.
        </p>

        {stats && (
          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-line bg-panel px-4 py-2.5 text-xs text-ink-muted sm:text-sm">
            <AboutStat value={stats.totalTransactions.toLocaleString()} label="Transactions" />
            <AboutStatDivider />
            <AboutStat value={compactUSD.format(stats.estimatedVolume)} label="Est. volume" />
            <AboutStatDivider />
            <AboutStat value={stats.totalFilings.toLocaleString()} label="Filings" />
            <AboutStatDivider />
            <AboutStat value={stats.totalMembers.toLocaleString()} label="Members covered" />
            <AboutStatDivider />
            <AboutStat
              value={formatDateFromTimestamp(stats.lastCheckedAt ?? stats.lastIngestedAt)}
              label={`Last checked${formatTimeWithZone(stats.lastCheckedAt ?? stats.lastIngestedAt) ? ` · ${formatTimeWithZone(stats.lastCheckedAt ?? stats.lastIngestedAt)}` : ""}`}
            />
          </div>
        )}

        <div className="mt-10 space-y-8">
          <Section title="What is a Periodic Transaction Report?">
            <p>
              The STOCK Act of 2012 requires members of Congress, and senior staff, to publicly report most
              securities transactions — stocks, bonds, options, and similar assets — worth more than $1,000, within
              45 days of the trade. That disclosure is filed on a standard form called a{" "}
              <strong className="text-ink">Periodic Transaction Report</strong>, or PTR. It's the same underlying
              document behind every row on this site.
            </p>
          </Section>

          <Section title="Where the data comes from">
            <p>
              House PTRs are filed as PDFs with the Office of the Clerk. CongTrade downloads the Clerk&rsquo;s public
              filing index directly and parses each PDF&rsquo;s transaction table — asset, ticker, buy or sell, dates,
              and disclosed amount range.
            </p>
            <p>
              Senate PTRs are filed with the Office of Public Records. Electronic filings are parsed straight from
              their HTML transaction table. A portion of both chambers&rsquo; filings — mostly hand-delivered paper
              forms — arrive as scanned images with no extractable text; those are read with a purpose-built OCR
              pipeline that locates each form&rsquo;s own gridlines from the scan and reads every cell and checkbox
              mark individually, rather than a single pass over the whole page.
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
              dataset. Ticker market caps, where shown, are resolved and refreshed monthly via Finnhub.
            </p>
          </Section>

          <Section title="How dollar amounts are estimated">
            <p>
              The STOCK Act only requires a member to disclose which bracket a trade&rsquo;s value falls into — from
              &ldquo;$1,001&ndash;$15,000&rdquo; up to &ldquo;Over $50,000,000&rdquo; — never an exact figure.
              CongTrade always shows that disclosed range as filed. Where a single number is more useful for
              comparison — like the total &ldquo;Est. volume&rdquo; figure shown on the dashboard and on each
              member&rsquo;s profile — we take the midpoint of the disclosed range and sum it across trades, and
              label it as an estimate everywhere it appears.
            </p>
          </Section>

          <Section title="How often the data updates">
            <p>
              An automated pipeline checks the House Clerk&rsquo;s and Senate&rsquo;s disclosure systems every 4
              hours and ingests any newly filed PTRs it finds — nothing about the schedule depends on any single
              machine staying on. The &ldquo;Last checked&rdquo; timestamp in the stat strip above, and elsewhere
              across the site, reflects the most recent of those runs.
            </p>
          </Section>

          <Section title="Data quality and limitations">
            <p>We&rsquo;d rather show you nothing than show you a guess. In practice that means:</p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                A transaction recovered by OCR rather than read directly as text carries a visible{" "}
                <strong className="text-ink">OCR</strong> badge, linking to the original scan, wherever it appears.
              </li>
              <li>A line the parser can&rsquo;t confidently match to an asset, amount, or date is logged and left out rather than guessed at.</li>
              <li>Dates are stored exactly as filed, even on the rare filing with an internal typo — we don&rsquo;t silently correct the source document.</li>
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
              behalf of any political party, campaign, PAC, member of Congress, or government body — it exists to
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

          <Section title="Contact">
            <p>
              Questions, corrections, or feedback — about a specific trade, the data pipeline, or anything else — can
              be sent to{" "}
              <a href="mailto:contact@congtrade.com" className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted">
                contact@congtrade.com
              </a>
              . Legal or privacy-specific questions go to{" "}
              <a href="mailto:legal@congtrade.com" className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted">
                legal@congtrade.com
              </a>{" "}
              and{" "}
              <a href="mailto:privacy@congtrade.com" className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted">
                privacy@congtrade.com
              </a>{" "}
              respectively.
            </p>
          </Section>
        </div>
      </main>
      <Footer />
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <div className="mt-2 space-y-2.5 text-sm leading-relaxed text-ink-muted">{children}</div>
    </section>
  );
}

function AboutStat({ value, label }: { value: string; label: string }) {
  return (
    <span className="whitespace-nowrap">
      <span className="font-semibold text-ink">{value}</span> {label}
    </span>
  );
}

function AboutStatDivider() {
  return <span className="hidden text-ink-faint/50 sm:inline">·</span>;
}
