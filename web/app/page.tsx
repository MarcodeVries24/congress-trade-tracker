"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  amountLabel,
  displayAssetName,
  DashboardData,
  displayName,
  fetchDashboard,
  fetchStats,
  Stats,
  VOLUME_ESTIMATE_NOTE,
} from "@/lib/api";
import { issuerSlug } from "@/lib/issuerSlug";
import { memberDisplayName } from "@/lib/memberDisplay";
import { AmericanFlag } from "@/components/AmericanFlag";
import { AboutCongTrade } from "@/components/AboutCongTrade";
import { SentimentRiver } from "@/components/SentimentRiver";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AdSlot } from "@/components/AdSlot";
import { MemberPhoto } from "@/components/MemberPhoto";
import { compactAmountRange, compactUSD, formatDateFromTimestamp, formatTimeWithZone, typeBadge } from "@/lib/format";

// Same free, ungated search param /trades already supports (ILIKE across
// member_name/asset_name/ticker) — deliberately not the paid member/ticker
// filters, so every dashboard link works for anonymous visitors too.
/** Falls back to the old free-text search only for a row with no slug. */
function memberHref(row: { member_slug: string | null; member_name: string }): string {
  return row.member_slug ? `/politicians/${row.member_slug}` : `/trades?q=${encodeURIComponent(row.member_name)}`;
}

function memberLocationFromDashboard(row: { chamber: "house" | "senate"; state_district: string | null; member_state: string | null }): string | null {
  if (row.chamber === "senate") return row.member_state ?? row.state_district;
  return row.state_district;
}

// members_reference.party stores the full party name (e.g. "Democrat"),
// not a letter code — matched case-insensitively by prefix since a value
// could plausibly come through as "D"/"Dem" from an unmapped source too.
function partyColor(party: string): string {
  const p = party.toLowerCase();
  if (p.startsWith("d")) return "bg-sky-500";
  if (p.startsWith("r")) return "bg-rose-500";
  if (p.startsWith("i")) return "bg-violet-500";
  return "bg-line-strong";
}

export default function Home() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Toggles between the two lists the API already computed server-side —
  // no refetch needed, just swaps which array the Latest Trades card reads.
  const [assetFilter, setAssetFilter] = useState<"stocks" | "all">("stocks");

  useEffect(() => {
    fetchDashboard()
      .then(setDashboard)
      .catch((err) => setError(err.message ?? "Failed to load dashboard"));
    fetchStats(["house", "senate"]).then(setStats).catch(() => {});
  }, []);

  const totalChamberCount = dashboard ? dashboard.chamberBreakdown.reduce((sum, c) => sum + c.count, 0) : 0;
  const totalPartyCount = dashboard ? dashboard.partyBreakdown.reduce((sum, p) => sum + p.count, 0) : 0;
  const latestTrades = dashboard ? (assetFilter === "stocks" ? dashboard.latestTradesStocks : dashboard.latestTradesAll) : [];

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="relative mb-4 overflow-hidden rounded-xl border border-line bg-panel px-4 py-3 sm:mb-8 sm:px-8 sm:py-8">
          <AmericanFlag
            className="pointer-events-none absolute inset-y-0 right-0 h-full w-2/3 opacity-[0.14] sm:w-1/2"
            style={{ maskImage: "linear-gradient(to right, transparent, black 45%)", WebkitMaskImage: "linear-gradient(to right, transparent, black 45%)" }}
          />
          <div className="relative">
            <h1 className="text-base font-semibold tracking-tight sm:text-2xl">Every disclosed Congress asset trade, at a glance</h1>
            <p className="mt-1 max-w-2xl text-xs text-ink-muted sm:mt-2 sm:text-sm">
              Built directly from Periodic Transaction Reports filed with the House Clerk and Senate eFD. Updated every 4 hours.
            </p>
          </div>
        </div>

        {stats && (
          <div className="mb-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-line bg-panel px-4 py-2.5 text-xs text-ink-muted sm:text-sm">
            <StatItem value={stats.totalTransactions.toLocaleString()} label="Transactions" />
            <StatDivider />
            <StatItem value={compactUSD.format(stats.estimatedVolume)} label="Est. volume" hint={VOLUME_ESTIMATE_NOTE} />
            <StatDivider />
            <StatItem value={stats.totalFilings.toLocaleString()} label="Filings" />
            <StatDivider />
            <StatItem value={stats.totalMembers.toLocaleString()} label="Members" />
            <StatDivider />
            <StatItem
              value={formatDateFromTimestamp(stats.lastCheckedAt ?? stats.lastIngestedAt)}
              label={`Last checked${formatTimeWithZone(stats.lastCheckedAt ?? stats.lastIngestedAt) ? ` · ${formatTimeWithZone(stats.lastCheckedAt ?? stats.lastIngestedAt)}` : ""}`}
            />
          </div>
        )}
        {stats && <p className="mb-4 border-x border-transparent px-4 text-[11px] leading-snug text-ink-faint sm:mb-6">{VOLUME_ESTIMATE_NOTE}</p>}

        <div className="mb-6 sm:mb-8">
          <AdSlot />
        </div>

        {error && (
          <div className="mb-6 rounded-md border border-rose-800 bg-rose-500/10 px-4 py-3 text-sm text-rose-500 dark:text-rose-300">
            {error}. Check that DATABASE_URL is set and the database is reachable.
          </div>
        )}

        {/* Latest Trades beside a sidebar of two cards. Row counts are chosen
            to bring the two columns close — LATEST_TRADES_LIMIT in
            api/dashboard/route.ts is set against the sidebar's two 8-row
            cards — but 66px trade rows against 56px sidebar rows never land
            exactly, and the last 15px showed as a step at the foot of the
            grid. So the columns stretch to the taller of the two and the
            shorter one takes up the remainder inside its own border, where
            15px of extra padding is invisible. Matching the counts still
            matters: it keeps that remainder small enough not to read as a
            hole. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-6">
          {/* Latest Trades */}
          <Card
            title="Latest Trades"
            href="/trades"
            className="h-full lg:col-span-2"
            actions={
              <div className="flex items-center gap-1 text-[11px]">
                {(["stocks", "all"] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setAssetFilter(v)}
                    className={`rounded-full border px-2.5 py-1 font-medium transition-colors ${
                      assetFilter === v ? "border-accent/40 bg-accent/15 text-accent" : "border-line text-ink-faint hover:text-ink-muted"
                    }`}
                  >
                    {v === "stocks" ? "Stocks" : "All assets"}
                  </button>
                ))}
              </div>
            }
          >
            {!dashboard && <CardSkeleton rows={7} />}
            {dashboard && latestTrades.length === 0 && <EmptyRow />}
            {dashboard && (
              <ul className="divide-y divide-line/60">
                {latestTrades.map((trade) => {
                  const badge = typeBadge(trade.transaction_type);
                  return (
                    <li key={trade.id}>
                      <Link
                        href={memberHref(trade)}
                        className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-panel-muted sm:px-5"
                      >
                        <MemberPhoto name={trade.member_name} photoUrl={trade.photo_url} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-ink">{memberDisplayName(trade)}</div>
                          <div className="truncate text-xs text-ink-faint">
                            {trade.ticker ? `${trade.ticker} · ` : ""}
                            {displayAssetName(trade)}
                          </div>
                        </div>
                        <div className="shrink-0 whitespace-nowrap text-right">
                          <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge.className}`}>{badge.label}</span>
                          <div className="mt-1 text-xs text-ink-muted">{compactAmountRange(trade.amount_low, trade.amount_high, amountLabel(trade.amount_range))}</div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* Sidebar: Most Active Politicians + Top by Trading Volume, stacked */}
          <div className="flex h-full flex-col gap-4 lg:gap-6">
            <Card title="Most Active Politicians" href="/politicians?sort=trade_count">
              {!dashboard && <CardSkeleton rows={6} />}
              {dashboard && dashboard.topPoliticians.length === 0 && <EmptyRow />}
              {dashboard && (
                <ul className="divide-y divide-line/60">
                  {dashboard.topPoliticians.map((p, i) => {
                    const location = memberLocationFromDashboard(p);
                    return (
                      <li key={`${p.member_name}-${i}`}>
                        <Link href={memberHref(p)} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-panel-muted sm:px-5">
                          <MemberPhoto name={p.member_name} photoUrl={p.photo_url} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm text-ink">{memberDisplayName(p)}</div>
                            <div className="truncate text-xs text-ink-faint">
                              {p.party ? `${p.party} · ` : ""}
                              {location ?? p.chamber}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-sm font-semibold text-ink">{p.trade_count.toLocaleString()}</div>
                            <div className="text-[10px] uppercase tracking-wide text-ink-faint">trades</div>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card title="Top by Trading Volume" href="/politicians?sort=volume_sum" className="flex-1">
              {!dashboard && <CardSkeleton rows={6} />}
              {dashboard && dashboard.topByVolume.length === 0 && <EmptyRow />}
              {dashboard && (
                <ul className="divide-y divide-line/60">
                  {dashboard.topByVolume.map((p, i) => {
                    const location = memberLocationFromDashboard(p);
                    return (
                      <li key={`${p.member_name}-${i}`}>
                        <Link href={memberHref(p)} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-panel-muted sm:px-5">
                          <MemberPhoto name={p.member_name} photoUrl={p.photo_url} />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm text-ink">{memberDisplayName(p)}</div>
                            <div className="truncate text-xs text-ink-faint">
                              {p.party ? `${p.party} · ` : ""}
                              {location ?? p.chamber}
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-sm font-semibold text-ink">{compactUSD.format(p.volume_sum)}</div>
                            <div className="text-[10px] uppercase tracking-wide text-ink-faint">
                              est. · {p.trade_count.toLocaleString()} trade{p.trade_count === 1 ? "" : "s"}
                            </div>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:mt-6 lg:grid-cols-3">
          {/* Most Traded Stocks */}
          <Card title="Most Traded Stocks" href="/issuers">
            {!dashboard && <CardSkeleton rows={6} />}
            {dashboard && dashboard.topStocks.length === 0 && <EmptyRow />}
            {dashboard && (
              <ul className="divide-y divide-line/60">
                {dashboard.topStocks.map((s) => (
                  <li key={s.ticker}>
                    <Link href={`/issuers/${issuerSlug(s.ticker)}`} className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-panel-muted sm:px-5">
                      <span className="text-sm font-medium text-ink">{s.ticker}</span>
                      <span className="text-sm text-ink-muted">
                        {s.trade_count.toLocaleString()} trade{s.trade_count === 1 ? "" : "s"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Biggest Recent Trades */}
          <Card title="Biggest Recent Trades" href="/trades">
            {!dashboard && <CardSkeleton rows={5} />}
            {dashboard && dashboard.biggestTrades.length === 0 && <EmptyRow />}
            {dashboard && (
              <ul className="divide-y divide-line/60">
                {dashboard.biggestTrades.map((trade) => (
                  <li key={trade.id}>
                    <Link href={memberHref(trade)} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-panel-muted sm:px-5">
                      <MemberPhoto name={trade.member_name} photoUrl={trade.photo_url} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-ink">{memberDisplayName(trade)}</div>
                        <div className="truncate text-xs text-ink-faint">{trade.ticker ?? displayAssetName(trade)}</div>
                      </div>
                      <div className="shrink-0 whitespace-nowrap text-right text-xs font-medium text-ink-muted">
                        {compactAmountRange(trade.amount_low, trade.amount_high, amountLabel(trade.amount_range))}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Activity Breakdown */}
          <Card title="Activity Breakdown">
            {!dashboard && <CardSkeleton rows={4} />}
            {dashboard && (
              <div className="space-y-5 px-4 py-4 sm:px-5">
                <div>
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">By chamber</div>
                  <div className="space-y-1.5">
                    {dashboard.chamberBreakdown.map((c) => {
                      const pct = totalChamberCount > 0 ? Math.round((c.count / totalChamberCount) * 100) : 0;
                      return (
                        <div key={c.chamber}>
                          <div className="mb-0.5 flex items-center justify-between text-xs text-ink-muted">
                            <span className="capitalize">{c.chamber}</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-muted">
                            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-faint">By party</div>
                  <div className="space-y-1.5">
                    {dashboard.partyBreakdown.map((p) => {
                      const pct = totalPartyCount > 0 ? Math.round((p.count / totalPartyCount) * 100) : 0;
                      return (
                        <div key={p.party}>
                          <div className="mb-0.5 flex items-center justify-between text-xs text-ink-muted">
                            <span>{p.party}</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-muted">
                            <div className={`h-full rounded-full ${partyColor(p.party)}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* A column of prose beside the chart rather than a band above it: at
            full width the paragraphs stretch to a single unreadable line. */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:mt-6 lg:grid-cols-3 lg:gap-6">
          <AboutCongTrade trades={stats?.totalTransactions} members={stats?.totalMembers} />
          <div className="lg:col-span-2">
            <SentimentRiver />
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

function Card({
  title,
  href,
  actions,
  className = "",
  children,
}: {
  title: string;
  href?: string;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`flex flex-col overflow-hidden rounded-lg border border-line bg-panel ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <div className="flex items-center gap-3">
          {actions}
          {href && (
            <Link href={href} className="shrink-0 text-xs text-accent hover:underline">
              View all →
            </Link>
          )}
        </div>
      </div>
      <div className="flex-1">{children}</div>
    </section>
  );
}

function CardSkeleton({ rows }: { rows: number }) {
  return (
    <div className="animate-pulse divide-y divide-line/60">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
          <div className="h-8 w-8 shrink-0 rounded-full bg-panel-muted" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3 w-2/3 rounded bg-panel-muted" />
            <div className="h-2.5 w-1/3 rounded bg-panel-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyRow() {
  return <div className="px-4 py-8 text-center text-sm text-ink-faint sm:px-5">No data yet.</div>;
}

function StatItem({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <span className="whitespace-nowrap" title={hint}>
      <span className="font-semibold text-ink">{value}</span> {label}
    </span>
  );
}

function StatDivider() {
  return <span className="hidden text-ink-faint/50 sm:inline">·</span>;
}
