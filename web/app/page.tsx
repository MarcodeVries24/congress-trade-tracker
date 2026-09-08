"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AMOUNT_RANGES,
  ASSET_TYPE_LABELS,
  fetchStats,
  fetchTrades,
  OWNER_LABELS,
  Stats,
  Trade,
  TradeFilters,
} from "@/lib/api";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

const compactUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

function typeBadge(type: string): { label: string; className: string } {
  const t = type.toUpperCase();
  if (t.startsWith("P")) return { label: "Purchase", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
  if (t.startsWith("S")) return { label: type.includes("partial") ? "Sale (partial)" : "Sale", className: "bg-rose-500/15 text-rose-400 border-rose-500/30" };
  if (t.startsWith("E")) return { label: "Exchange", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
  return { label: type, className: "bg-slate-500/15 text-slate-300 border-slate-500/30" };
}

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const inputClass =
  "rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-slate-500";

export default function Home() {
  const [q, setQ] = useState("");
  const [ticker, setTicker] = useState("");
  const [type, setType] = useState("");
  const [owner, setOwner] = useState("");
  const [assetType, setAssetType] = useState("");
  const [amountRange, setAmountRange] = useState("");
  const [lateOnly, setLateOnly] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState("transaction_date");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  const [result, setResult] = useState<{ data: Trade[]; total: number; totalPages: number } | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debouncedQ = useDebounced(q);
  const debouncedTicker = useDebounced(ticker);

  const filters: TradeFilters = useMemo(
    () => ({
      q: debouncedQ || undefined,
      ticker: debouncedTicker || undefined,
      type: type || undefined,
      owner: owner || undefined,
      assetType: assetType || undefined,
      amountRange: amountRange || undefined,
      lateOnly: lateOnly ? 1 : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      sort,
      order,
      page,
    }),
    [debouncedQ, debouncedTicker, type, owner, assetType, amountRange, lateOnly, dateFrom, dateTo, sort, order, page]
  );

  useEffect(() => {
    setPage(1);
  }, [debouncedQ, debouncedTicker, type, owner, assetType, amountRange, lateOnly, dateFrom, dateTo, sort, order]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchTrades(filters)
      .then((res) => {
        if (!cancelled) setResult(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? "Failed to load trades");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filters]);

  useEffect(() => {
    fetchStats()
      .then(setStats)
      .catch(() => {});
  }, []);

  function toggleSort(key: string) {
    if (sort === key) {
      setOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setOrder(key === "member_name" || key === "ticker" ? "asc" : "desc");
    }
  }

  function SortHeader({ label, sortKey }: { label: string; sortKey: string }) {
    const active = sort === sortKey;
    return (
      <th className="px-4 py-3">
        <button
          onClick={() => toggleSort(sortKey)}
          className={`flex items-center gap-1 uppercase tracking-wide hover:text-slate-200 ${active ? "text-slate-200" : ""}`}
        >
          {label}
          <span className="text-[10px]">{active ? (order === "asc" ? "▲" : "▼") : ""}</span>
        </button>
      </th>
    );
  }

  const activeFilterCount = [type, owner, assetType, amountRange, dateFrom, dateTo].filter(Boolean).length + (lateOnly ? 1 : 0);

  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Congress Trade Tracker</h1>
        <p className="mt-1 text-sm text-slate-400">
          U.S. House stock trades, sourced directly from Periodic Transaction Reports filed with the{" "}
          <a
            href="https://disclosures-clerk.house.gov/FinancialDisclosure"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-slate-600 hover:decoration-slate-400"
          >
            Office of the Clerk
          </a>
          . Senate coverage is not yet available.
        </p>
      </header>

      {stats && (
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard label="Transactions" value={stats.totalTransactions.toLocaleString()} />
          <StatCard label="Est. volume" value={compactUSD.format(stats.estimatedVolume)} />
          <StatCard label="Filings ingested" value={stats.totalFilings.toLocaleString()} />
          <StatCard label="Members tracked" value={stats.totalMembers.toLocaleString()} />
          <StatCard
            label="Last updated"
            value={stats.lastIngestedAt ? formatDate(stats.lastIngestedAt.slice(0, 10)) : "—"}
          />
        </div>
      )}

      <div className="mb-6 space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Search member, asset, or ticker…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className={`min-w-[220px] flex-1 ${inputClass}`}
          />
          <input
            type="text"
            placeholder="Ticker (e.g. NVDA)"
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            className={`w-40 ${inputClass}`}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}>
            <option value="">All types</option>
            <option value="P">Purchase</option>
            <option value="S">Sale</option>
            <option value="E">Exchange</option>
          </select>
          <select value={owner} onChange={(e) => setOwner(e.target.value)} className={inputClass}>
            <option value="">All owners</option>
            {Object.entries(OWNER_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select value={assetType} onChange={(e) => setAssetType(e.target.value)} className={inputClass}>
            <option value="">All asset types</option>
            {Object.entries(ASSET_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select value={amountRange} onChange={(e) => setAmountRange(e.target.value)} className={inputClass}>
            <option value="">Any trade size</option>
            {AMOUNT_RANGES.map((range) => (
              <option key={range} value={range}>
                {range}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className={inputClass}
          />
          <span className="text-slate-500">to</span>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inputClass} />
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input
              type="checkbox"
              checked={lateOnly}
              onChange={(e) => setLateOnly(e.target.checked)}
              className="h-4 w-4 rounded border-slate-700 bg-slate-950"
            />
            Filed late only (&gt;45 days)
          </label>
          {activeFilterCount > 0 && (
            <button
              onClick={() => {
                setType("");
                setOwner("");
                setAssetType("");
                setAmountRange("");
                setLateOnly(false);
                setDateFrom("");
                setDateTo("");
              }}
              className="text-xs text-slate-500 underline decoration-slate-700 hover:text-slate-300 hover:decoration-slate-400"
            >
              Clear {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-rose-800 bg-rose-950/40 px-4 py-3 text-sm text-rose-300">
          {error}. Check that DATABASE_URL is set and the database is reachable.
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/60 text-left text-xs uppercase tracking-wide text-slate-500">
              <SortHeader label="Member" sortKey="member_name" />
              <SortHeader label="Asset" sortKey="ticker" />
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Owner</th>
              <SortHeader label="Amount" sortKey="amount_low" />
              <SortHeader label="Traded" sortKey="transaction_date" />
              <SortHeader label="Filed" sortKey="days_to_file" />
              <th className="px-4 py-3">Source</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && result?.data.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  No trades match these filters.
                </td>
              </tr>
            )}
            {!loading &&
              result?.data.map((trade) => {
                const badge = typeBadge(trade.transaction_type);
                const assetTypeLabel = trade.asset_type_code ? ASSET_TYPE_LABELS[trade.asset_type_code] ?? trade.asset_type_code : null;
                const late = trade.days_to_file !== null && trade.days_to_file > 45;
                return (
                  <tr key={trade.id} className="border-b border-slate-800/60 hover:bg-slate-900/40">
                    <td className="px-4 py-3">
                      <div className="font-medium">{trade.member_name}</div>
                      {trade.state_district && (
                        <div className="text-xs text-slate-500">{trade.state_district}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div>{trade.asset_name}</div>
                      <div className="mt-0.5 flex gap-2 text-xs text-slate-500">
                        {trade.ticker && <span className="font-mono">{trade.ticker}</span>}
                        {assetTypeLabel && <span>{assetTypeLabel}</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full border px-2 py-0.5 text-xs ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{OWNER_LABELS[trade.owner ?? "self"] ?? trade.owner}</td>
                    <td className="px-4 py-3 text-slate-300">{trade.amount_range}</td>
                    <td className="px-4 py-3 text-slate-300">{formatDate(trade.transaction_date)}</td>
                    <td className="px-4 py-3 text-slate-300">
                      <div>{formatDate(trade.filing_date)}</div>
                      {trade.days_to_file !== null && (
                        <div className={`text-xs ${late ? "text-rose-400" : "text-slate-500"}`}>
                          {trade.days_to_file}d {late ? "· late" : ""}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <a
                        href={trade.pdf_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-slate-400 underline decoration-slate-700 hover:text-slate-200 hover:decoration-slate-400"
                      >
                        PTR PDF
                      </a>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {result && result.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
          <span>
            Page {result.data.length ? page : 0} of {result.totalPages} · {result.total.toLocaleString()} trades
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-md border border-slate-700 px-3 py-1.5 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={page >= result.totalPages}
              onClick={() => setPage((p) => Math.min(result.totalPages, p + 1))}
              className="rounded-md border border-slate-700 px-3 py-1.5 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}
