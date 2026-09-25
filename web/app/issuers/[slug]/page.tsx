import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { MemberPhoto } from "@/components/MemberPhoto";
import { AdSlot } from "@/components/AdSlot";
import {
  amountLabel,
  ASSET_TYPE_LABELS,
  displayAssetName,
  formatMarketCap,
  marketCapTierLabel,
  ownerLabel,
  VOLUME_ESTIMATE_NOTE,
} from "@/lib/api";
import { compactUSD, formatDate, typeBadge } from "@/lib/format";
import { getIssuerBySlug, ISSUER_PAGE_TRADE_LIMIT } from "@/lib/issuers";

/**
 * One page per traded company — the asset-side counterpart to the member
 * pages, and server-rendered for the same reason: a crawler asking for
 * /issuers/msft gets the company, the totals, who traded it and a hundred
 * real trades in the HTML, not a shell to execute.
 *
 * Nothing enumerates the issuers either. A ticker nobody has traded before
 * gets a page the moment its first filing publishes.
 */

function partyColor(party: string | null): string {
  if (!party) return "text-ink-faint";
  const p = party.toLowerCase();
  if (p.startsWith("d")) return "text-sky-600 dark:text-sky-400";
  if (p.startsWith("r")) return "text-rose-600 dark:text-rose-400";
  if (p.startsWith("i")) return "text-violet-600 dark:text-violet-400";
  return "text-ink-faint";
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const found = await getIssuerBySlug(slug);
  if (!found) return { title: "Issuer not found — CongTrade" };

  const { issuer } = found;
  const name = issuer.company_name ?? issuer.ticker;
  const description =
    `${issuer.trade_count.toLocaleString()} disclosed trades in ${name} (${issuer.ticker}) by ` +
    `${issuer.politician_count.toLocaleString()} member${issuer.politician_count === 1 ? "" : "s"} of Congress, ` +
    `taken straight from their Periodic Transaction Reports` +
    `${issuer.last_traded ? `. Most recent trade ${formatDate(issuer.last_traded)}.` : "."}`;

  return {
    title: `${name} (${issuer.ticker}) — Congress stock trades | CongTrade`,
    description,
    alternates: { canonical: `/issuers/${issuer.slug}` },
    openGraph: { title: `${name} (${issuer.ticker}) — Congress trades`, description, type: "website" },
  };
}

export default async function IssuerPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await getIssuerBySlug(slug);
  if (!found) notFound();

  const { issuer, traders, trades } = found;
  const name = issuer.company_name ?? issuer.ticker;
  const tradesHref = `/trades?tickers=${encodeURIComponent(issuer.ticker)}`;
  const cap = formatMarketCap(issuer.market_cap);

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-ink-faint">
          <Link href="/issuers" className="hover:text-ink-muted">
            Issuers
          </Link>
          <span className="mx-1.5">/</span>
          <span className="text-ink-muted">{name}</span>
        </nav>

        <div className="rounded-xl border border-line bg-panel p-4 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border border-line bg-panel-muted font-mono text-sm font-semibold text-ink-muted">
              {issuer.ticker.slice(0, 5)}
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">{name}</h1>
              <p className="mt-0.5 text-sm text-ink-muted">
                <span className="font-mono">{issuer.ticker}</span>
                {cap ? ` · ${cap} market cap · ${marketCapTierLabel(issuer.market_cap)}` : ""}
              </p>
            </div>
          </div>

          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Disclosed trades" value={issuer.trade_count.toLocaleString()} />
            <Stat label="Est. volume" value={compactUSD.format(issuer.volume_sum)} hint={VOLUME_ESTIMATE_NOTE} />
            <Stat label="Purchases / sales" value={`${issuer.purchases.toLocaleString()} / ${issuer.sales.toLocaleString()}`} />
            <Stat label="Members trading" value={issuer.politician_count.toLocaleString()} />
          </dl>
          <p className="mt-2 text-[11px] leading-snug text-ink-faint">{VOLUME_ESTIMATE_NOTE}</p>

          {traders.length > 0 && (
            <div className="mt-5 border-t border-line pt-4">
              <h2 className="text-xs font-medium uppercase tracking-wide text-ink-faint">Most active members in {issuer.ticker}</h2>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {traders.map((t) => {
                  const inner = (
                    <>
                      <MemberPhoto name={t.display} photoUrl={t.photo_url} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-ink">{t.display}</div>
                        <div className={`truncate text-xs ${partyColor(t.party)}`}>{t.party ?? "Unknown party"}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-semibold text-ink">{t.trade_count.toLocaleString()}</div>
                        <div className="text-[10px] uppercase tracking-wide text-ink-faint">trades</div>
                      </div>
                    </>
                  );
                  const className = "flex items-center gap-2.5 rounded-lg border border-line bg-panel-muted px-3 py-2";
                  return t.slug ? (
                    <Link key={t.display} href={`/politicians/${t.slug}`} className={`${className} transition-colors hover:border-line-strong`}>
                      {inner}
                    </Link>
                  ) : (
                    <div key={t.display} className={className}>
                      {inner}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="my-6">
          <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_ID_TOP} />
        </div>

        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-ink">
            {issuer.trade_count > ISSUER_PAGE_TRADE_LIMIT
              ? `${ISSUER_PAGE_TRADE_LIMIT} most recent trades`
              : `All ${issuer.trade_count.toLocaleString()} disclosed trades`}
          </h2>
          <Link href={tradesHref} className="text-xs text-accent underline decoration-line-strong hover:decoration-current">
            Open in the full trade browser
          </Link>
        </div>

        {/* Desktop table; phones get cards below, same reasoning as the member
            pages — this traffic arrives mostly on mobile. */}
        <div className="hidden overflow-x-auto rounded-lg border border-line sm:block">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line bg-panel-muted text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-3">Member</th>
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
                const display = traders.find((x) => x.member_name === t.member_name)?.display ?? t.member_name;
                return (
                  <tr key={t.id} className="border-b border-line/50">
                    <td className="px-4 py-3">
                      {t.member_slug ? (
                        <Link href={`/politicians/${t.member_slug}`} className="text-ink hover:underline">
                          {display}
                        </Link>
                      ) : (
                        <span className="text-ink">{display}</span>
                      )}
                      <div className={`mt-0.5 text-xs ${partyColor(t.party)}`}>{t.party ?? "Unknown party"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-ink-muted">{displayAssetName(t)}</div>
                      {t.asset_type_code && (
                        <div className="mt-0.5 text-xs text-ink-faint">{ASSET_TYPE_LABELS[t.asset_type_code] ?? t.asset_type_code}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded border px-1.5 py-0.5 text-xs font-medium ${badge.className}`}>{badge.label}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-ink-muted">{ownerLabel(t.owner)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{amountLabel(t.amount_range)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{formatDate(t.transaction_date)}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-muted">
                      {formatDate(t.filing_date)}
                      {t.days_to_file !== null && t.days_to_file > 45 && (
                        <span className="ml-1.5 text-xs text-amber-500" title="Filed more than 45 days after the trade">
                          late
                        </span>
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
            const display = traders.find((x) => x.member_name === t.member_name)?.display ?? t.member_name;
            return (
              <div key={t.id} className={`rounded-lg border border-line border-l-2 bg-panel p-3 ${badge.accent}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {t.member_slug ? (
                      <Link href={`/politicians/${t.member_slug}`} className="truncate text-sm text-ink hover:underline">
                        {display}
                      </Link>
                    ) : (
                      <div className="truncate text-sm text-ink">{display}</div>
                    )}
                    <div className="mt-0.5 text-xs text-ink-faint">
                      {t.asset_type_code && `${ASSET_TYPE_LABELS[t.asset_type_code] ?? t.asset_type_code}`}
                      {t.owner && ` · ${ownerLabel(t.owner)}`}
                    </div>
                  </div>
                  <span className={`shrink-0 whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-muted">
                  <span className="text-ink">{amountLabel(t.amount_range)}</span>
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
          Figures come from members&rsquo; own Periodic Transaction Reports, which disclose a value <em>bracket</em> rather
          than an exact amount. Every row links to the original filing. A member of Congress trading {name} is not a
          recommendation or endorsement of it, and nothing here is investment advice.
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
