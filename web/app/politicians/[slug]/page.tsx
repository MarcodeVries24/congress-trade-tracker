import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { MemberPhoto } from "@/components/MemberPhoto";
import { AdSlot } from "@/components/AdSlot";
import { ASSET_TYPE_LABELS, OWNER_LABELS, cleanAssetName } from "@/lib/api";
import { compactUSD, formatDate, typeBadge } from "@/lib/format";
import { getMemberBySlug, MEMBER_PAGE_TRADE_LIMIT } from "@/lib/members";

/**
 * One page per member who has traded.
 *
 * This is the only page on the site whose content is in the HTML rather than
 * fetched after hydration. That's the point: a crawler asking for
 * /politicians/nancy-pelosi gets her name, party, state, totals and a hundred
 * real trades, instead of an empty shell it has to render JavaScript to fill.
 *
 * Nothing enumerates the members. The route resolves whatever the database
 * holds, so the first published filing from a member nobody has seen before
 * makes their page exist — no build, no list to update.
 */

function subtitle(p: { chamber: string | null; state: string | null; state_district: string | null; party: string | null }) {
  const chamber = p.chamber === "senate" ? "Senator" : p.chamber === "house" ? "Representative" : null;
  // Senate rows key on a synthetic "SEN:lastname" district, which isn't fit to
  // show — the joined state column is the real one for them.
  const where = p.chamber === "senate" ? p.state : (p.state_district ?? p.state);
  return [chamber, where, p.party].filter(Boolean).join(" · ");
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const member = await getMemberBySlug(slug);
  if (!member) return { title: "Member not found — CongTrade" };

  const { profile } = member;
  const description =
    `${profile.trade_count.toLocaleString()} disclosed stock and asset trades by ${profile.display}` +
    `${profile.state ? ` (${subtitle(profile)})` : ""}, taken straight from their Periodic Transaction Reports` +
    `${profile.last_filed ? `. Most recent filing ${formatDate(profile.last_filed)}.` : "."}`;

  return {
    title: `${profile.display} — stock trades and disclosures | CongTrade`,
    description,
    alternates: { canonical: `/politicians/${profile.slug}` },
    openGraph: { title: `${profile.display} — disclosed trades`, description, type: "profile" },
  };
}

export default async function MemberPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const member = await getMemberBySlug(slug);
  if (!member) notFound();

  const { profile, trades } = member;
  const tradesHref = `/trades?${profile.names.map((n) => `members=${encodeURIComponent(n)}`).join("&")}`;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-ink-faint">
          <Link href="/politicians" className="hover:text-ink-muted">
            Politicians
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-ink-muted">{profile.display}</span>
        </nav>

        <div className="rounded-xl border border-line bg-panel p-4 sm:p-6">
          <div className="flex items-start gap-4">
            <MemberPhoto name={profile.display} photoUrl={profile.photo_url} className="h-16 w-16" />
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">{profile.display}</h1>
              <p className="mt-0.5 text-sm text-ink-muted">{subtitle(profile) || "Member of Congress"}</p>
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Disclosed trades" value={profile.trade_count.toLocaleString()} />
            <Stat label="Est. volume" value={compactUSD.format(profile.volume_low)} hint="Sum of each disclosed bracket's lower bound" />
            <Stat label="Purchases / sales" value={`${profile.purchases.toLocaleString()} / ${profile.sales.toLocaleString()}`} />
            <Stat label="Latest filing" value={formatDate(profile.last_filed)} />
          </dl>

          {profile.top_tickers.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <h2 className="text-xs font-medium uppercase tracking-wide text-ink-faint">Most traded</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {profile.top_tickers.map((t) => (
                  <span key={t.ticker} className="rounded-full border border-line bg-panel-muted px-2.5 py-1 text-xs text-ink-muted">
                    <span className="text-ink">{t.ticker}</span> {t.count}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="my-6">
          <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_ID_TOP} />
        </div>

        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-ink">
            {profile.trade_count > MEMBER_PAGE_TRADE_LIMIT
              ? `${MEMBER_PAGE_TRADE_LIMIT} most recent trades`
              : `All ${profile.trade_count.toLocaleString()} disclosed trades`}
          </h2>
          <Link href={tradesHref} className="text-xs text-accent underline decoration-line-strong hover:decoration-current">
            Open in the full trade browser
          </Link>
        </div>

        {/* Desktop table. Phones get cards below — these pages exist to catch
            search traffic, which arrives mostly on mobile, and a table that
            scrolls sideways is the wrong thing to land on. */}
        <div className="hidden overflow-x-auto rounded-lg border border-line sm:block">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line bg-panel-muted text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-3">Asset</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Traded</th>
                <th className="px-4 py-3">Filed</th>
                <th className="px-4 py-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((t) => {
                const badge = typeBadge(t.transaction_type);
                return (
                  <tr key={t.id} className="border-b border-line/50">
                    <td className="px-4 py-3">
                      <div className="text-ink">{cleanAssetName(t.asset_name)}</div>
                      <div className="mt-0.5 text-xs text-ink-faint">
                        {t.ticker && <span className="text-ink-muted">{t.ticker}</span>}
                        {t.ticker && t.asset_type_code && " · "}
                        {t.asset_type_code && (ASSET_TYPE_LABELS[t.asset_type_code] ?? t.asset_type_code)}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded border px-1.5 py-0.5 text-xs font-medium ${badge.className}`}>{badge.label}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-muted">{t.owner ? (OWNER_LABELS[t.owner] ?? t.owner) : "Self"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{t.amount_range ?? "—"}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{formatDate(t.transaction_date)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-muted">
                      {formatDate(t.filing_date)}
                      {t.days_to_file !== null && t.days_to_file > 45 && (
                        <span className="ml-1.5 text-xs text-amber-500" title="Filed more than 45 days after the trade">late</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <a href={t.pdf_url} target="_blank" rel="noreferrer" className="text-xs text-accent underline decoration-line-strong hover:decoration-current">
                        PTR PDF
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="space-y-2 sm:hidden">
          {trades.map((t) => {
            const badge = typeBadge(t.transaction_type);
            return (
              <div key={t.id} className={`rounded-lg border border-line border-l-2 bg-panel p-3 ${badge.accent}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-ink">{cleanAssetName(t.asset_name)}</div>
                    <div className="mt-0.5 text-xs text-ink-faint">
                      {t.ticker && <span className="text-ink-muted">{t.ticker}</span>}
                      {t.ticker && t.asset_type_code && " · "}
                      {t.asset_type_code && (ASSET_TYPE_LABELS[t.asset_type_code] ?? t.asset_type_code)}
                      {t.owner && ` · ${OWNER_LABELS[t.owner] ?? t.owner}`}
                    </div>
                  </div>
                  <span className={`shrink-0 whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                  <span className="text-ink">{t.amount_range ?? "—"}</span>
                  <span>traded {formatDate(t.transaction_date)}</span>
                  <span className="text-ink-faint">
                    filed {formatDate(t.filing_date)}
                    {t.days_to_file !== null && t.days_to_file > 45 && <span className="ml-1 text-amber-500">late</span>}
                  </span>
                  <a href={t.pdf_url} target="_blank" rel="noreferrer" className="text-accent underline decoration-line-strong">
                    PTR PDF
                  </a>
                </div>
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-ink-faint">
          Figures come from {profile.display}&rsquo;s own Periodic Transaction Reports, which disclose a value{" "}
          <em>bracket</em> rather than an exact amount — the volume above sums the lower bound of each bracket and is
          therefore a floor, not an estimate of what was actually traded. Every row links to the original filing.
          Nothing here is investment advice.
        </p>
      </main>
      <Footer />
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel-muted px-3 py-2.5" title={hint}>
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="mt-0.5 text-base font-semibold text-ink">{value}</dd>
    </div>
  );
}
