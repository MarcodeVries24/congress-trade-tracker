import type { Metadata } from "next";
import { PricingTable } from "@clerk/nextjs";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { UpgradeDraftHandoff } from "@/components/UpgradeDraftHandoff";
import { AlertEmailPreview } from "@/components/AlertEmailPreview";
import { UpgradeFaq } from "@/components/UpgradeFaq";
import { getUpgradeProof } from "@/lib/upgradeProof";
import { getProPricing } from "@/lib/plans";
import { formatDateFromTimestamp } from "@/lib/format";

export const metadata: Metadata = {
  title: "Upgrade — CongTrade",
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

export default async function UpgradePage() {
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

        {/* Renders only for someone who arrived mid-way through building an
            alert — see UpgradeDraftHandoff. Kept high on the page: it names
            the thing they were actually trying to do. */}
        <div className="mt-6">
          <UpgradeDraftHandoff />
        </div>

        {/* Read from the same tables the site serves. If ingestion stalls,
            this goes stale in public — which is the right incentive. */}
        {proof && (
          <div className="mt-8 grid grid-cols-2 divide-x divide-y divide-line rounded-xl border border-line bg-panel sm:grid-cols-4 sm:divide-y-0">
            <Stat value={proof.transactions.toLocaleString("en-US")} label="disclosed trades" />
            <Stat value={proof.filings.toLocaleString("en-US")} label="filings parsed" />
            <Stat value={proof.members.toLocaleString("en-US")} label="members covered" />
            <Stat
              value="every 4h"
              label={
                proof.lastCheckedAt ? `checked — last on ${formatDateFromTimestamp(proof.lastCheckedAt)}` : "checked"
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
              body="Nothing is held back from free visitors. Every trade, member and issuer page stays open to everyone — Pro pays for the tools on top, not for access to public records."
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

        <section className="mt-14">
          <h2 className="text-lg font-bold tracking-tight text-ink">Pricing</h2>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
            Join 4,500+ people already using CongTrade Pro.
            {pricing?.annualSavingPercent
              ? ` Paying annually works out at ${pricing.currencySymbol}${pricing.annualMonthly} a month instead of ${pricing.currencySymbol}${pricing.monthly} — ${pricing.annualSavingPercent}% less.`
              : ""}{" "}
            Cancel any time from your account page.
          </p>
          <div className="mt-5">
            <PricingTable />
          </div>
        </section>

        <UpgradeFaq />
      </main>
      <Footer />
    </>
  );
}
