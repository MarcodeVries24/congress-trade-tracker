"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ASSET_TYPE_LABELS,
  cleanAssetName,
  DashboardData,
  displayName,
  fetchDashboard,
  fetchStats,
  Stats,
} from "@/lib/api";
import { AmericanFlag } from "@/components/AmericanFlag";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AdSlot } from "@/components/AdSlot";
import { MemberPhoto } from "@/components/MemberPhoto";
import { compactUSD, formatDateFromTimestamp, formatTimeWithZone, typeBadge } from "@/lib/format";

// Same free, ungated search param /trades already supports (ILIKE across
// member_name/asset_name/ticker) — deliberately not the paid member/ticker
// filters, so every dashboard link works for anonymous visitors too.
function tradesSearchHref(query: string): string {
  return `/trades?q=${encodeURIComponent(query)}`;
}

function memberLocationFromDashboard(row: { chamber: "house" | "senate"; state_district: string | null; member_state: string | null }): string | null {
  if (row.chamber === "senate") return row.member_state ?? row.state_district;
  return row.state_district;
}

const PARTY_LABEL: Record<string, string> = { D: "Democrat", R: "Republican", I: "Independent" };
const PARTY_COLOR: Record<string, string> = {
  D: "bg-sky-500",
  R: "bg-rose-500",
  I: "bg-violet-500",
};

export default function Home() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboard()
      .then(setDashboard)
      .catch((err) => setError(err.message ?? "Failed to load dashboard"));
    fetchStats(["house", "senate"]).then(setStats).catch(() => {});
  }, []);

  const totalChamberCount = dashboard ? dashboard.chamberBreakdown.reduce((sum, c) => sum + c.count, 0) : 0;
  const totalPartyCount = dashboard ? dashboard.partyBreakdown.reduce((sum, p) => sum + p.count, 0) : 0;

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
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-line bg-panel px-4 py-2.5 text-xs text-ink-muted sm:mb-6 sm:text-sm">
            <StatItem value={stats.totalTransactions.toLocaleString()} label="Transactions" />
            <StatDivider />
            <StatItem value={compactUSD.format(stats.estimatedVolume)} label="Est. volume" />
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

        <div className="mb-6 sm:mb-8">
          <AdSlot />
        </div>

        {error && (
          <div className="mb-6 rounded-md border border-rose-800 bg-rose-500/10 px-4 py-3 text-sm text-rose-500 dark:text-rose-300">
            {error}. Check that DATABASE_URL is set and the database is reachable.
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {/* Latest Trades */}
          <Card title="Latest Trades" href="/trades" className="lg:col-span-2 lg:row-span-2">
            {!dashboard && <CardSkeleton rows={7} />}
            {dashboard && dashboard.latestTrades.length === 0 && <EmptyRow />}
            {dashboard && (
              <ul className="divide-y divide-line/60">
                {dashboard.latestTrades.map((trade) => {
                  const badge = typeBadge(trade.transaction_type);
                  return (
                    <li key={trade.id}>
                      <Link
                        href={tradesSearchHref(trade.member_name)}
                        className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-panel-muted sm:px-5"
                      >
                        <MemberPhoto name={trade.member_name} photoUrl={trade.photo_url} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-ink">{displayName(trade.member_name)}</div>
                          <div className="truncate text-xs text-ink-faint">
                            {trade.ticker ? `${trade.ticker} · ` : ""}
                            {cleanAssetName(trade.asset_name)}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge.className}`}>{badge.label}</span>
                          <div className="mt-1 text-xs text-ink-muted">{trade.amount_range}</div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* Most Active Politicians */}
          <Card title="Most Active Politicians" href="/trades">
            {!dashboard && <CardSkeleton rows={6} />}
            {dashboard && dashboard.topPoliticians.length === 0 && <EmptyRow />}
            {dashboard && (
              <ul className="divide-y divide-line/60">
                {dashboard.topPoliticians.map((p, i) => {
                  const location = memberLocationFromDashboard(p);
                  return (
                    <li key={`${p.member_name}-${i}`}>
                      <Link href={tradesSearchHref(p.member_name)} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-panel-muted sm:px-5">
                        <MemberPhoto name={p.member_name} photoUrl={p.photo_url} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm text-ink">{displayName(p.member_name)}</div>
                          <div className="truncate text-xs text-ink-faint">
                            {p.party ? `${p.party} · ` : ""}
                            {location ?? p.chamber}
                          </div>
                        </div>
                        <div className="shrink-0 text-right text-sm font-semibold text-ink">{p.trade_count.toLocaleString()}</div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* Most Traded Stocks */}
          <Card title="Most Traded Stocks" href="/trades">
            {!dashboard && <CardSkeleton rows={6} />}
            {dashboard && dashboard.topStocks.length === 0 && <EmptyRow />}
            {dashboard && (
              <ul className="divide-y divide-line/60">
                {dashboard.topStocks.map((s) => (
                  <li key={s.ticker}>
                    <Link href={tradesSearchHref(s.ticker)} className="flex items-center justify-between gap-3 px-4 py-2.5 transition-colors hover:bg-panel-muted sm:px-5">
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
                    <Link href={tradesSearchHref(trade.member_name)} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-panel-muted sm:px-5">
                      <MemberPhoto name={trade.member_name} photoUrl={trade.photo_url} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm text-ink">{displayName(trade.member_name)}</div>
                        <div className="truncate text-xs text-ink-faint">{trade.ticker ?? cleanAssetName(trade.asset_name)}</div>
                      </div>
                      <div className="shrink-0 text-right text-xs font-medium text-ink-muted">{trade.amount_range}</div>
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
                            <span>{PARTY_LABEL[p.party] ?? p.party}</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-panel-muted">
                            <div className={`h-full rounded-full ${PARTY_COLOR[p.party] ?? "bg-line-strong"}`} style={{ width: `${pct}%` }} />
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
      </main>
      <Footer />
    </>
  );
}

function Card({ title, href, className = "", children }: { title: string; href?: string; className?: string; children: React.ReactNode }) {
  return (
    <section className={`flex flex-col overflow-hidden rounded-lg border border-line bg-panel ${className}`}>
      <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {href && (
          <Link href={href} className="text-xs text-accent hover:underline">
            View all →
          </Link>
        )}
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

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <span className="whitespace-nowrap">
      <span className="font-semibold text-ink">{value}</span> {label}
    </span>
  );
}

function StatDivider() {
  return <span className="hidden text-ink-faint/50 sm:inline">·</span>;
}
