"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { displayName, fetchPoliticians, PAGE_SIZE_OPTIONS, PoliticianRow } from "@/lib/api";
import { compactUSD, formatDate } from "@/lib/format";
import { useDebounced } from "@/lib/useDebounced";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Select } from "@/components/Select";
import { AdSlot } from "@/components/AdSlot";
import { MemberPhoto } from "@/components/MemberPhoto";

const SORT_OPTIONS: { value: string; label: string; sort: "trade_count" | "volume_sum" | "last_filed"; order: "asc" | "desc" }[] = [
  { value: "trade_count:desc", label: "Most trades", sort: "trade_count", order: "desc" },
  { value: "trade_count:asc", label: "Fewest trades", sort: "trade_count", order: "asc" },
  { value: "volume_sum:desc", label: "Highest est. volume", sort: "volume_sum", order: "desc" },
  { value: "volume_sum:asc", label: "Lowest est. volume", sort: "volume_sum", order: "asc" },
  { value: "last_filed:desc", label: "Most recently active", sort: "last_filed", order: "desc" },
  { value: "last_filed:asc", label: "Least recently active", sort: "last_filed", order: "asc" },
];

function tradesSearchHref(query: string): string {
  return `/trades?q=${encodeURIComponent(query)}`;
}

function memberLocationFromRow(row: { chamber: "house" | "senate"; state_district: string | null; member_state: string | null }): string | null {
  if (row.chamber === "senate") return row.member_state ?? row.state_district;
  return row.state_district;
}

function partyColor(party: string | null): string {
  if (!party) return "text-ink-faint";
  const p = party.toLowerCase();
  if (p.startsWith("d")) return "text-sky-600 dark:text-sky-400";
  if (p.startsWith("r")) return "text-rose-600 dark:text-rose-400";
  if (p.startsWith("i")) return "text-violet-600 dark:text-violet-400";
  return "text-ink-faint";
}

export default function Politicians() {
  const searchParams = useSearchParams();
  // The dashboard's "Most Active Politicians" / "Top by Trading Volume"
  // cards link here with ?sort=trade_count or ?sort=volume_sum so the
  // leaderboard opens already sorted the way the card that sent them here
  // was ranked, instead of always resetting to the default.
  const initialSort = searchParams.get("sort");
  const initialSortValue = SORT_OPTIONS.find((o) => o.sort === initialSort)?.value ?? "trade_count:desc";

  const [q, setQ] = useState("");
  const [chamber, setChamber] = useState<"house" | "senate" | "both">("both");
  const [sortValue, setSortValue] = useState(initialSortValue);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [result, setResult] = useState<{ data: PoliticianRow[]; total: number; totalPages: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debouncedQ = useDebounced(q);
  const activeSort = SORT_OPTIONS.find((o) => o.value === sortValue) ?? SORT_OPTIONS[0];

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, chamber, sortValue]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchPoliticians({
      q: debouncedQ || undefined,
      chamber: chamber === "both" ? undefined : [chamber],
      sort: activeSort.sort,
      order: activeSort.order,
      page,
      limit: pageSize,
    })
      .then((res) => {
        if (!cancelled) setResult(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? "Failed to load politicians");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, chamber, activeSort.sort, activeSort.order, page, pageSize]);

  const rows = result?.data ?? [];

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-base font-semibold tracking-tight sm:text-2xl">Politicians — trading activity leaderboard</h1>
          <p className="mt-1 max-w-2xl text-xs text-ink-muted sm:mt-2 sm:text-sm">
            Every member of Congress with a disclosed trade, ranked by how often they trade and an estimated volume — the sum of each
            trade&apos;s disclosed range midpoint, since exact amounts are never reported.
          </p>
        </div>

        <div className="mb-4 sm:mb-6">
          <AdSlot />
        </div>

        <div className="mb-4 flex flex-wrap gap-3 rounded-lg border border-line bg-panel p-4">
          <input
            type="text"
            placeholder="Search a politician…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="min-w-[180px] flex-1 rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-line-strong"
          />
          <Select
            aria-label="Chamber"
            value={chamber}
            onChange={(e) => setChamber(e.target.value as "house" | "senate" | "both")}
            active={chamber !== "both"}
            className="w-full sm:w-auto"
          >
            <option value="both">Any chamber</option>
            <option value="house">House only</option>
            <option value="senate">Senate only</option>
          </Select>
          <Select aria-label="Sort" value={sortValue} onChange={(e) => setSortValue(e.target.value)} className="w-full sm:w-auto">
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                Sort: {opt.label}
              </option>
            ))}
          </Select>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-rose-800 bg-rose-500/10 px-4 py-3 text-sm text-rose-500 dark:text-rose-300">{error}</div>
        )}

        {/* Desktop table */}
        <div className="hidden overflow-x-auto rounded-lg border border-line sm:block">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line bg-panel-muted text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Member</th>
                <th className="px-4 py-3">Chamber</th>
                <th className="px-4 py-3">Trades</th>
                <th className="px-4 py-3">Est. Volume</th>
                <th className="px-4 py-3">Avg / Trade</th>
                <th className="px-4 py-3">Last Filed</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-ink-faint">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-ink-faint">
                    No politicians match this search.
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((p, i) => {
                  const location = memberLocationFromRow(p);
                  const avg = p.trade_count > 0 ? p.volume_sum / p.trade_count : 0;
                  return (
                    <tr key={`${p.member_name}-${i}`} className="border-b border-line/50 transition-colors hover:bg-panel-muted">
                      <td className="px-4 py-3 text-ink-faint">{(page - 1) * pageSize + i + 1}</td>
                      <td className="px-4 py-3">
                        <Link href={tradesSearchHref(p.member_name)} className="flex items-center gap-2.5">
                          <MemberPhoto name={p.member_name} photoUrl={p.photo_url} />
                          <div>
                            <div className="text-ink hover:underline">{displayName(p.member_name)}</div>
                            <div className={`text-xs ${partyColor(p.party)}`}>
                              {p.party ?? "Unknown party"}
                              {location ? ` · ${location}` : ""}
                            </div>
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 capitalize text-ink-muted">{p.chamber}</td>
                      <td className="px-4 py-3 text-ink">{p.trade_count.toLocaleString()}</td>
                      <td className="px-4 py-3 text-ink">{compactUSD.format(p.volume_sum)}</td>
                      <td className="px-4 py-3 text-ink-muted">{compactUSD.format(avg)}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-ink-muted">{formatDate(p.last_filed)}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="space-y-2 sm:hidden">
          {loading && <div className="rounded-lg border border-line bg-panel px-4 py-8 text-center text-sm text-ink-faint">Loading…</div>}
          {!loading && rows.length === 0 && (
            <div className="rounded-lg border border-line bg-panel px-4 py-8 text-center text-sm text-ink-faint">No politicians match this search.</div>
          )}
          {!loading &&
            rows.map((p, i) => {
              const location = memberLocationFromRow(p);
              const avg = p.trade_count > 0 ? p.volume_sum / p.trade_count : 0;
              return (
                <Link
                  key={`${p.member_name}-${i}`}
                  href={tradesSearchHref(p.member_name)}
                  className="flex items-center gap-3 rounded-lg border border-line bg-panel px-4 py-3"
                >
                  <span className="w-5 shrink-0 text-xs text-ink-faint">{(page - 1) * pageSize + i + 1}</span>
                  <MemberPhoto name={p.member_name} photoUrl={p.photo_url} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-ink">{displayName(p.member_name)}</div>
                    <div className={`truncate text-xs ${partyColor(p.party)}`}>
                      {p.party ?? "Unknown party"}
                      {location ? ` · ${location}` : ""}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold text-ink">{compactUSD.format(p.volume_sum)}</div>
                    <div className="text-[10px] uppercase tracking-wide text-ink-faint">
                      {p.trade_count.toLocaleString()} trade{p.trade_count === 1 ? "" : "s"} · avg {compactUSD.format(avg)}
                    </div>
                  </div>
                </Link>
              );
            })}
        </div>

        {result && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-muted">
            <div className="flex items-center gap-2">
              <span>Show</span>
              <Select
                aria-label="Page size"
                value={String(pageSize)}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="w-20"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
              <span>
                Page {page} of {result.totalPages || 1} · {result.total.toLocaleString()} politicians
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(result.totalPages || 1, p + 1))}
                disabled={page >= (result.totalPages || 1)}
                className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}

        <div className="mt-6">
          <AdSlot />
        </div>
      </main>
      <Footer />
    </>
  );
}
