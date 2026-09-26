import type { Metadata } from "next";
import { PricingTable } from "@clerk/nextjs";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { UpgradeDraftHandoff } from "@/components/UpgradeDraftHandoff";
import { AlertEmailPreview } from "@/components/AlertEmailPreview";
import { UpgradeFaq } from "@/components/UpgradeFaq";
import { MemberFaces } from "@/components/MemberFaces";
import { PersonalNote } from "@/components/PersonalNote";
import { getUpgradeProof } from "@/lib/upgradeProof";
import { getProPricing } from "@/lib/plans";
import { ALERT_DRAFT_PARAM } from "@/lib/alertsClient";
import { formatDateFromTimestamp } from "@/lib/format";

export const metadata: Metadata = {
  title: "Upgrade | CongTrade",
  description:
    "Filter every disclosed Congress trade by member, ticker, size and market cap, and get an email the moment a new filing matches. Built from the filings themselves.",
};

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="px-4 py-3 text-center">
      <p className="text-lg font-bold tracking-tight text-ink sm:text-xl">{value}</p>
      <p className="mt-0.5 text-[11px] leading-tight text-ink-faint">{label}</p>
    </div>
  );
}

function Feature({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-5">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{body}</p>
      {children}
    </div>
  );
}

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Where checkout lets them out. Left to itself it returns them here, to a
  // pricing page that now reads "subscribed" — the one page a new subscriber
  // has no further use for. A half-built alert goes back to itself; everyone
  // else lands on their account, where the alerts live.
  const draft = (await searchParams)[ALERT_DRAFT_PARAM];
  const afterCheckout =
    typeof draft === "string" && draft
      ? `/account?${ALERT_DRAFT_PARAM}=${encodeURIComponent(draft)}`
      : "/account";

  // Both are decoration on a page whose job is to take payment: a database
  // hiccup should cost the proof strip, never the pricing table.
  const [proof, pricing] = await Promise.all([
    getUpgradeProof().catch(() => null),
    getProPricing().catch(() => null),
  ]);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Upgrade to CongTrade Pro</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">
          Every trade on CongTrade is free to read. Pro is for following it closely: filter the whole archive down to
          what you care about, and get an email the moment a new filing matches.
        </p>

        {proof && proof.faces.length > 0 && (
          <div className="mt-5">
            <MemberFaces faces={proof.faces} total={proof.members} />
          </div>
        )}

        {/* Renders only for someone who arrived mid-way through building an
            alert — see UpgradeDraftHandoff. Kept high on the page: it names
            the thing they were actually trying to do. */}
        <div className="mt-6">
          <UpgradeDraftHandoff />
        </div>

        {/* The price sits above everything that argues for it. Most people
            arriving here clicked a locked control and already know what they
            want; making them scroll past a case they have accepted is a tax
            on the ones most likely to pay. The argument still follows, for
            everyone who does want it. */}
        <section className="mt-7">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-lg font-bold tracking-tight text-ink">Pricing</h2>
            {pricing?.annualSavingPercent ? (
              <p className="text-xs font-medium text-accent">
                Save {pricing.annualSavingPercent}% on annual billing: {pricing.currencySymbol}
                {pricing.annualMonthly}/mo instead of {pricing.currencySymbol}
                {pricing.monthly}
              </p>
            ) : null}
          </div>
          {/* ctaPosition="top" puts each Subscribe directly under its price
              instead of at the foot of the card, so the free plan's shorter
              card doesn't strand its button under a screen of nothing. */}
          <div className="mt-4">
            <PricingTable ctaPosition="top" newSubscriptionRedirectUrl={afterCheckout} />
          </div>
          {/* Ticks rather than middots between the items: a separator only
              works while the row is one line, and at most widths this one
              wraps, leaving a stray dot hanging at the end of a line. */}
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-ink-muted">
            {[
              <>
                <span className="font-medium text-ink">Join 4,500+ people</span> already using CongTrade Pro
              </>,
              <>Cancel any time from your account page</>,
              <>
                Sourced from{" "}
                <a
                  href="https://disclosures-clerk.house.gov/FinancialDisclosure"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-line-strong hover:text-ink"
                >
                  House Clerk
                </a>{" "}
                and{" "}
                <a
                  href="https://efdsearch.senate.gov/search/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline decoration-line-strong hover:text-ink"
                >
                  Senate eFD
                </a>{" "}
                filings
              </>,
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mt-[3px] shrink-0 text-accent"
                  aria-hidden
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Directly under the buttons: this is where someone stalls, and what
            stalls them is "who am I giving a card number to". */}
        <div className="mt-8">
          <PersonalNote />
        </div>

        {/* Read from the same tables the site serves. If ingestion stalls,
            this goes stale in public — which is the right incentive. */}
        {proof && (
          <div className="mt-12 grid grid-cols-2 divide-x divide-y divide-line rounded-xl border border-line bg-panel sm:grid-cols-4 sm:divide-y-0">
            <Stat value={proof.transactions.toLocaleString("en-US")} label="disclosed trades" />
            <Stat value={proof.filings.toLocaleString("en-US")} label="filings parsed" />
            <Stat value={proof.members.toLocaleString("en-US")} label="members covered" />
            <Stat
              value="every 4h"
              label={
                proof.lastCheckedAt ? `checked, last on ${formatDateFromTimestamp(proof.lastCheckedAt)}` : "checked"
              }
            />
          </div>
        )}
        <p className="mt-3 text-xs leading-relaxed text-ink-faint">
          Built from the Periodic Transaction Reports members file with the House Clerk and the Senate&apos;s eFD
          system. Every trade links back to the original filing, so you can check any of it against the source.
        </p>

        <section className="mt-12">
          <h2 className="text-lg font-bold tracking-tight text-ink">What Pro adds</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Feature
              title="Filters"
              body="Narrow the archive by member, ticker, party, state, chamber, trade type, owner, trade size, market-cap tier and filing date, in any combination. The filters live in the URL, so a view you build is a link you can save, bookmark or send to someone."
            />
            <Feature
              title="Email alerts"
              body="Save any filter as an alert and get an email when a new disclosure matches it. Instant or a daily digest, as many alerts as you need, each one switched off in a click."
            />
            <Feature
              title="No ads"
              body="Every page, ad-free."
            />
            <Feature
              title="The same data, either way"
              body="Nothing is held back from free visitors. Every trade, member and issuer page stays open to everyone. Pro pays for the tools on top, not for access to public records."
            />
          </div>
        </section>

        {proof && proof.sample.length > 0 && (
          <section className="mt-12">
            <h2 className="text-lg font-bold tracking-tight text-ink">What an alert looks like</h2>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-ink-muted">
              This one watches for House purchases over $50,001. It arrives looking like this:
            </p>
            <div className="mt-4">
              <AlertEmailPreview trades={proof.sample} />
            </div>
          </section>
        )}

        <UpgradeFaq />
      </main>
      <Footer />
    </>
  );
}
