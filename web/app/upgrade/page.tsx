import type { Metadata } from "next";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { UpgradeDraftHandoff } from "@/components/UpgradeDraftHandoff";
import { AlertEmailPreview } from "@/components/AlertEmailPreview";
import { UpgradeFaq } from "@/components/UpgradeFaq";
import { MemberFaces } from "@/components/MemberFaces";
import { PersonalNote } from "@/components/PersonalNote";
import { getUpgradeProof } from "@/lib/upgradeProof";
import { formatDateFromTimestamp } from "@/lib/format";
import { Cong } from "@/components/Cong";
import { ProInAppSteps } from "@/components/ProInAppSteps";
import { ProStatusNote } from "@/components/ProStatusNote";

export const metadata: Metadata = {
  title: "CongTrade Pro | CongTrade",
  description:
    "Filter every disclosed Congress trade by member, ticker, size and market cap, and get an alert when a new filing matches. CongTrade Pro is sold in the CongTrade app for iPhone and Android, and unlocks the website too.",
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

/**
 * CongTrade Pro, and where to get it.
 *
 * Pro is sold in the app only. Apple and Google take the payment and look
 * after the VAT, the receipts and the refunds; the subscription belongs to the
 * CongTrade account, so the website's filters and alerts open for the same
 * account the moment it holds Pro. This page used to take payment through
 * Stripe; it now says how to get Pro, and keeps the case for it.
 */
export default async function UpgradePage() {
  // Decoration: a database hiccup should cost the proof strip, never the page.
  const proof = await getUpgradeProof().catch(() => null);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <div className="flex items-center justify-between gap-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">CongTrade Pro</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-muted">
              Every trade on CongTrade is free to read. Pro is for following it closely: filter the whole archive down
              to what you care about, and get an alert the moment a new filing matches.
            </p>
          </div>
          <Cong mood="go-premium" width={104} className="hidden sm:block" />
        </div>

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

        {/* Where to get it, above everything that argues for it: most people
            arriving here clicked a locked control and already know what they
            want. */}
        <section className="mt-7 overflow-hidden rounded-xl border border-line bg-panel">
          <div className="grid gap-6 p-5 sm:grid-cols-[minmax(0,1fr)_160px] sm:p-7">
            <div>
              <h2 className="text-lg font-bold tracking-tight text-ink">Get Pro in the app</h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                CongTrade Pro is sold in the CongTrade app for iPhone and Android. One subscription covers the app and
                this website.
              </p>
              <ProStatusNote />
              <div className="mt-5">
                <ProInAppSteps />
              </div>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- already sized; see AppPromo */}
            <img
              src="/app-screens/04-alerts.jpg"
              alt="The CongTrade app's Alerts tab"
              width={506}
              height={1100}
              loading="lazy"
              decoding="async"
              className="hidden h-auto w-full self-center rounded-2xl border border-line shadow-sm sm:block"
            />
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-1.5 border-t border-line px-5 py-3 text-xs text-ink-muted sm:px-7">
            {[
              <>Priced and billed by the App Store or Google Play</>,
              <>Cancel any time in your App Store or Google Play settings</>,
              <>
                <span className="font-medium text-ink">Every trade</span> straight from the official filings
              </>,
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="mt-[3.5px] shrink-0 text-accent"
                  aria-hidden
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* Who is behind this, for someone deciding whether to bother. */}
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
              title="Alerts"
              body="Save any filter as an alert and hear about it when a new disclosure matches: a push notification in the app, an email, or both. As many alerts as you need, each one switched off in a click."
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
