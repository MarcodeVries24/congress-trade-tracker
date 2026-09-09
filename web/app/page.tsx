"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AMOUNT_RANGES,
  ASSET_TYPE_LABELS,
  displayName,
  fetchStats,
  fetchTrades,
  OWNER_LABELS,
  PAGE_SIZE_OPTIONS,
  Stats,
  Trade,
  TradeFilters,
} from "@/lib/api";
import { MultiSelect } from "@/components/MultiSelect";
import { Select } from "@/components/Select";
import { Header } from "@/components/Header";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// Unlike formatDate (date-only fields, no time component), these take a full
// timestamp — used together so the date can be the prominent stat value and
// the time+timezone a smaller note underneath, in the viewer's local zone.
function formatDateFromTimestamp(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatTimeWithZone(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

// House's state_district ("MO04") is real and display-ready. Senate rows key
// members_reference by a synthetic "SEN:lastname" (Senate filings carry no
// district/state field) — not fit to show, so those use the joined state
// column from members_reference instead. Falls back to state_district if the
// state lookup hasn't matched (see README's Senate name-matching note).
function memberLocation(trade: Trade): string | null {
  if (trade.chamber === "senate") return trade.member_state ?? trade.state_district;
  return trade.state_district;
}

const compactUSD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

function typeBadge(type: string): { label: string; className: string; accent: string } {
  const t = type.toUpperCase();
  if (t.startsWith("P"))
    return { label: "Purchase", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30", accent: "border-l-emerald-500" };
  if (t.startsWith("S"))
    return {
      label: type.includes("partial") ? "Sale (partial)" : "Sale",
      className: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30",
      accent: "border-l-rose-500",
    };
  if (t.startsWith("E"))
    return { label: "Exchange", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30", accent: "border-l-amber-500" };
  return { label: type, className: "bg-ink-faint/10 text-ink-muted border-ink-faint/30", accent: "border-l-line-strong" };
}

// Rough magnitude tier so the eye can scan trade size without reading text.
function sizeTier(amountLow: number | null): number {
  if (amountLow === null) return 0;
  if (amountLow < 100_000) return 1;
  if (amountLow < 1_000_000) return 2;
  return 3;
}

function SizeIndicator({ amountLow }: { amountLow: number | null }) {
  const tier = sizeTier(amountLow);
  return (
    <div className="flex items-end gap-0.5" title={tier ? `Size tier ${tier}/3` : "Unknown size"} aria-hidden>
      {[1, 2, 3].map((i) => (
        <div
          key={i}
          className={`w-1 rounded-sm ${i <= tier ? "bg-amber-400" : "bg-line-strong"}`}
          style={{ height: `${i * 4 + 3}px` }}
        />
      ))}
    </div>
  );
}

const AVATAR_COLORS = [
  "bg-rose-500/20 text-rose-600 dark:text-rose-300",
  "bg-amber-500/20 text-amber-600 dark:text-amber-300",
  "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300",
  "bg-sky-500/20 text-sky-600 dark:text-sky-300",
  "bg-violet-500/20 text-violet-600 dark:text-violet-300",
  "bg-pink-500/20 text-pink-600 dark:text-pink-300",
  "bg-teal-500/20 text-teal-600 dark:text-teal-300",
  "bg-indigo-500/20 text-indigo-600 dark:text-indigo-300",
];

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function InitialsAvatar({ name }: { name: string }) {
  return (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${avatarColor(name)}`}
      aria-hidden
    >
      {initials(name)}
    </div>
  );
}

// Official photos are hotlinked from congress.gov; fall back to an initials
// avatar if one isn't mapped yet or fails to load, rather than guessing.
function MemberPhoto({ name, photoUrl }: { name: string; photoUrl: string | null }) {
  const [errored, setErrored] = useState(false);
  if (!photoUrl || errored) return <InitialsAvatar name={name} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={photoUrl}
      alt=""
      onError={() => setErrored(true)}
      className="h-8 w-8 shrink-0 rounded-full bg-panel-muted object-cover"
    />
  );
}

// Used by the mobile sort dropdown, which has no clickable column headers
// to sort by — same fields the desktop table's headers sort on.
const SORT_OPTIONS: { value: string; label: string; sort: string; order: "asc" | "desc" }[] = [
  { value: "filing_date:desc", label: "Newest filed", sort: "filing_date", order: "desc" },
  { value: "filing_date:asc", label: "Oldest filed", sort: "filing_date", order: "asc" },
  { value: "transaction_date:desc", label: "Newest traded", sort: "transaction_date", order: "desc" },
  { value: "transaction_date:asc", label: "Oldest traded", sort: "transaction_date", order: "asc" },
  { value: "days_to_file:desc", label: "Most days to file", sort: "days_to_file", order: "desc" },
  { value: "days_to_file:asc", label: "Fewest days to file", sort: "days_to_file", order: "asc" },
  { value: "amount_low:desc", label: "Amount: high to low", sort: "amount_low", order: "desc" },
  { value: "amount_low:asc", label: "Amount: low to high", sort: "amount_low", order: "asc" },
  { value: "member_name:asc", label: "Member A→Z", sort: "member_name", order: "asc" },
  { value: "ticker:asc", label: "Ticker A→Z", sort: "ticker", order: "asc" },
];

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const inputClass =
  "rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-line-strong transition-colors";

export default function Home() {
  const [chamber, setChamber] = useState<"house" | "senate" | "both">("both");
  const [q, setQ] = useState("");
  const [member, setMember] = useState("");
  const [ticker, setTicker] = useState("");
  const [type, setType] = useState("");
  const [owner, setOwner] = useState("");
  const [assetType, setAssetType] = useState("");
  const [amountRanges, setAmountRanges] = useState<string[]>([]);
  const [filedStatus, setFiledStatus] = useState<"" | "onTime" | "late">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState("filing_date");
  const [order, setOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [result, setResult] = useState<{ data: Trade[]; total: number; totalPages: number } | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debouncedQ = useDebounced(q);
  const debouncedMember = useDebounced(member);
  const debouncedTicker = useDebounced(ticker);

  const filters: TradeFilters = useMemo(
    () => ({
      chamber: chamber === "both" ? ["house", "senate"] : [chamber],
      q: debouncedQ || undefined,
      member: debouncedMember || undefined,
      ticker: debouncedTicker || undefined,
      type: type || undefined,
      owner: owner || undefined,
      assetType: assetType || undefined,
      amountRanges: amountRanges.length ? amountRanges : undefined,
      filedStatus: filedStatus || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      sort,
      order,
      page,
      limit: pageSize,
    }),
    [
      chamber,
      debouncedQ,
      debouncedMember,
      debouncedTicker,
      type,
      owner,
      assetType,
      amountRanges,
      filedStatus,
      dateFrom,
      dateTo,
      sort,
      order,
      page,
      pageSize,
    ]
  );

  useEffect(() => {
    setPage(1);
  }, [chamber, debouncedQ, debouncedMember, debouncedTicker, type, owner, assetType, amountRanges, filedStatus, dateFrom, dateTo, sort, order, pageSize]);

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
    fetchStats(chamber === "both" ? ["house", "senate"] : [chamber])
      .then(setStats)
      .catch(() => {});
  }, [chamber]);

  function toggleSort(key: string) {
    if (sort === key) {
      setOrder((o) => (o === "asc" ? "desc" : "asc"));
    } else {
      setSort(key);
      setOrder(key === "member_name" || key === "ticker" ? "asc" : "desc");
    }
  }

  function SortHeader({ label, sortKey, className = "" }: { label: string; sortKey: string; className?: string }) {
    const active = sort === sortKey;
    return (
      <th className={`px-4 py-3 ${className}`}>
        <button
          onClick={() => toggleSort(sortKey)}
          className={`flex items-center gap-1 whitespace-nowrap uppercase tracking-wide hover:text-ink ${active ? "text-ink" : ""}`}
        >
          {label}
          <span className="text-[10px]">{active ? (order === "asc" ? "▲" : "▼") : ""}</span>
        </button>
      </th>
    );
  }

  const activeFilterCount =
    [type, owner, assetType, dateFrom, dateTo, member, filedStatus].filter(Boolean).length +
    amountRanges.length +
    (chamber !== "both" ? 1 : 0);

  function clearFilters() {
    setChamber("both");
    setMember("");
    setType("");
    setOwner("");
    setAssetType("");
    setAmountRanges([]);
    setFiledStatus("");
    setDateFrom("");
    setDateTo("");
  }

  function applyDatePreset(days: number) {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    setDateTo(to.toISOString().slice(0, 10));
    setDateFrom(from.toISOString().slice(0, 10));
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-4 rounded-xl border border-line bg-panel px-4 py-3 sm:mb-8 sm:px-8 sm:py-8">
          <h1 className="text-base font-semibold tracking-tight sm:text-2xl">
            Every disclosed {chamber === "both" ? "Congress" : chamber === "senate" ? "Senate" : "House"} stock trade, searchable
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-ink-muted sm:mt-2 sm:text-sm">
            Built directly from Periodic Transaction Reports filed with the{" "}
            {chamber !== "senate" && (
              <a
                href="https://disclosures-clerk.house.gov/FinancialDisclosure"
                target="_blank"
                rel="noreferrer"
                className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted"
              >
                House Clerk
              </a>
            )}
            {chamber === "both" && " and the "}
            {chamber !== "house" && (
              <a
                href="https://efdsearch.senate.gov/search/home/"
                target="_blank"
                rel="noreferrer"
                className="underline decoration-line-strong hover:text-ink hover:decoration-ink-muted"
              >
                Senate eFD
              </a>
            )}{" "}
            — no third-party API in between. Refreshed automatically every 4 hours.
          </p>
        </div>

        {stats && (
          <div className="mb-4 grid grid-cols-3 gap-2 sm:mb-6 sm:grid-cols-5 sm:gap-3">
            <StatCard label="Transactions" value={stats.totalTransactions.toLocaleString()} />
            <StatCard label="Est. volume" value={compactUSD.format(stats.estimatedVolume)} />
            <StatCard label="Filings ingested" value={stats.totalFilings.toLocaleString()} />
            <StatCard label="Members tracked" value={stats.totalMembers.toLocaleString()} />
            <StatCard
              label="Last checked"
              value={formatDateFromTimestamp(stats.lastCheckedAt ?? stats.lastIngestedAt)}
              note={formatTimeWithZone(stats.lastCheckedAt ?? stats.lastIngestedAt)}
            />
          </div>
        )}

        <div className="mb-6 rounded-lg border border-line bg-panel p-4">
          <div className="flex items-center justify-between gap-3 sm:hidden">
            <button
              onClick={() => setFiltersOpen((o) => !o)}
              className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm text-ink"
            >
              Filters {activeFilterCount > 0 && <span className="rounded-full bg-accent/20 px-1.5 text-xs text-accent">{activeFilterCount}</span>}
              <span className="text-[10px] text-ink-faint">{filtersOpen ? "▴" : "▾"}</span>
            </button>
            {activeFilterCount > 0 && (
              <button onClick={clearFilters} className="text-xs text-ink-faint underline decoration-line-strong">
                Clear
              </button>
            )}
          </div>

          <div className="mt-3 sm:hidden">
            <Select
              value={`${sort}:${order}`}
              onChange={(e) => {
                const opt = SORT_OPTIONS.find((o) => o.value === e.target.value);
                if (opt) {
                  setSort(opt.sort);
                  setOrder(opt.order);
                }
              }}
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  Sort: {opt.label}
                </option>
              ))}
            </Select>
          </div>

          <div className={`${filtersOpen ? "mt-3 flex" : "hidden"} flex-col gap-3 sm:mt-0 sm:flex`}>
            <div className="flex flex-wrap gap-3">
              <input
                type="text"
                placeholder="Search asset or ticker…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className={`min-w-[160px] flex-1 ${inputClass}`}
              />
              <input
                type="text"
                placeholder="Filter by member name…"
                value={member}
                onChange={(e) => setMember(e.target.value)}
                className={`min-w-[160px] flex-1 ${inputClass}`}
              />
              <input
                type="text"
                placeholder="Ticker (e.g. NVDA)"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                className={`w-full sm:w-40 ${inputClass}`}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
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
              <Select value={type} onChange={(e) => setType(e.target.value)} className="w-full sm:w-auto">
                <option value="">All types</option>
                <option value="P">Purchase</option>
                <option value="S">Sale</option>
                <option value="E">Exchange</option>
              </Select>
              <Select value={owner} onChange={(e) => setOwner(e.target.value)} className="w-full sm:w-auto">
                <option value="">All owners</option>
                {Object.entries(OWNER_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
              <Select value={assetType} onChange={(e) => setAssetType(e.target.value)} className="w-full sm:w-auto">
                <option value="">All asset types</option>
                {Object.entries(ASSET_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
              <MultiSelect
                placeholder="Any trade size"
                className="w-full sm:w-48"
                selected={amountRanges}
                onChange={setAmountRanges}
                options={AMOUNT_RANGES.map((r) => ({ value: r, label: r }))}
              />
              <Select
                value={filedStatus}
                onChange={(e) => setFiledStatus(e.target.value as "" | "onTime" | "late")}
                className="w-full sm:w-auto"
              >
                <option value="">Any filing status</option>
                <option value="onTime">Filed on time (≤45 days)</option>
                <option value="late">Filed late (&gt;45 days)</option>
              </Select>
              <span className="text-xs text-ink-faint">Filed:</span>
              <Select
                value=""
                onChange={(e) => {
                  if (e.target.value !== "") applyDatePreset(Number(e.target.value));
                }}
                className="w-full sm:w-auto"
              >
                <option value="">Quick range…</option>
                <option value="0">Today</option>
                <option value="5">Last 5 days</option>
                <option value="30">Last 30 days</option>
                <option value="45">Last 45 days</option>
                <option value="90">Last 90 days</option>
                <option value="180">Last 180 days</option>
                <option value="365">Last year</option>
              </Select>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                title="Filed on or after"
                className={inputClass}
              />
              <span className="text-ink-faint">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                title="Filed on or before"
                className={inputClass}
              />
              {activeFilterCount > 0 && (
                <button
                  onClick={clearFilters}
                  className="hidden text-xs text-ink-faint underline decoration-line-strong hover:text-ink-muted hover:decoration-ink-muted sm:inline"
                >
                  Clear {activeFilterCount} filter{activeFilterCount > 1 ? "s" : ""}
                </button>
              )}
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-rose-800 bg-rose-500/10 px-4 py-3 text-sm text-rose-500 dark:text-rose-300">
            {error}. Check that DATABASE_URL is set and the database is reachable.
          </div>
        )}

        {/* Desktop table */}
        <div className="hidden overflow-x-auto rounded-lg border border-line sm:block">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-line bg-panel-muted text-left text-xs uppercase tracking-wide text-ink-faint">
                <SortHeader label="Member" sortKey="member_name" className="min-w-[170px]" />
                <SortHeader label="Asset" sortKey="ticker" />
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Owner</th>
                <SortHeader label="Amount" sortKey="amount_low" />
                <SortHeader label="Traded" sortKey="transaction_date" />
                <SortHeader label="Filed" sortKey="filing_date" />
                <SortHeader label="Days to file" sortKey="days_to_file" />
                <th className="px-4 py-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-ink-faint">
                    Loading…
                  </td>
                </tr>
              )}
              {!loading && result?.data.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-ink-faint">
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
                    <tr key={trade.id} className="border-b border-line/50 transition-colors hover:bg-panel-muted">
                      <td className={`min-w-[170px] border-l-2 px-4 py-3 ${badge.accent}`}>
                        <div className="flex items-center gap-2.5">
                          <MemberPhoto name={trade.member_name} photoUrl={trade.photo_url} />
                          <div>
                            <button
                              onClick={() => setMember(trade.member_name)}
                              className="text-left font-medium hover:underline"
                              title={`Filter to ${displayName(trade.member_name)}`}
                            >
                              {displayName(trade.member_name)}
                            </button>
                            {memberLocation(trade) && <div className="text-xs text-ink-faint">{memberLocation(trade)}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {trade.asset_name}
                          {trade.parse_status === "ocr" && <OcrBadge />}
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-faint">
                          {trade.ticker && (
                            <button
                              onClick={() => setTicker(trade.ticker as string)}
                              className="font-mono hover:text-ink hover:underline"
                              title={`Filter to ${trade.ticker}`}
                            >
                              {trade.ticker}
                            </button>
                          )}
                          {assetTypeLabel && <span>{assetTypeLabel}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${badge.className}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{OWNER_LABELS[trade.owner ?? "self"] ?? trade.owner}</td>
                      <td className="px-4 py-3 text-ink-muted">
                        <div className="flex items-center gap-2">
                          <SizeIndicator amountLow={trade.amount_low} />
                          <span className="whitespace-nowrap">{trade.amount_range}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{formatDate(trade.transaction_date)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{formatDate(trade.filing_date)}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        {trade.days_to_file !== null ? (
                          <span className={late ? "text-rose-500 dark:text-rose-400" : "text-ink-muted"}>
                            {trade.days_to_file}d{late ? " · late" : ""}
                          </span>
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <a
                          href={trade.pdf_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-ink-faint underline decoration-line-strong hover:text-ink hover:decoration-ink-muted"
                        >
                          {trade.parse_status === "ocr" ? "View Scan" : trade.chamber === "senate" ? "View Report" : "PTR PDF"}
                        </a>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="flex flex-col gap-3 sm:hidden">
          {loading && <div className="rounded-lg border border-line bg-panel px-4 py-8 text-center text-sm text-ink-faint">Loading…</div>}
          {!loading && result?.data.length === 0 && (
            <div className="rounded-lg border border-line bg-panel px-4 py-8 text-center text-sm text-ink-faint">
              No trades match these filters.
            </div>
          )}
          {!loading &&
            result?.data.map((trade) => {
              const badge = typeBadge(trade.transaction_type);
              const assetTypeLabel = trade.asset_type_code ? ASSET_TYPE_LABELS[trade.asset_type_code] ?? trade.asset_type_code : null;
              const late = trade.days_to_file !== null && trade.days_to_file > 45;
              return (
                <div key={trade.id} className={`rounded-lg border border-line border-l-4 bg-panel p-4 ${badge.accent}`}>
                  <div className="flex items-start justify-between gap-2">
                    <button onClick={() => setMember(trade.member_name)} className="flex items-center gap-2.5 text-left">
                      <MemberPhoto name={trade.member_name} photoUrl={trade.photo_url} />
                      <div>
                        <div className="font-medium">{displayName(trade.member_name)}</div>
                        {memberLocation(trade) && <div className="text-xs text-ink-faint">{memberLocation(trade)}</div>}
                      </div>
                    </button>
                    <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${badge.className}`}>
                      {badge.label}
                    </span>
                  </div>

                  <div className="mt-3 flex items-center gap-1.5 text-sm">
                    {trade.asset_name}
                    {trade.parse_status === "ocr" && <OcrBadge />}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-ink-faint">
                    {trade.ticker && (
                      <button onClick={() => setTicker(trade.ticker as string)} className="font-mono hover:text-ink hover:underline">
                        {trade.ticker}
                      </button>
                    )}
                    {assetTypeLabel && <span>{assetTypeLabel}</span>}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-y-2 text-xs">
                    <div>
                      <div className="text-ink-faint">Amount</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-ink-muted">
                        <SizeIndicator amountLow={trade.amount_low} />
                        {trade.amount_range}
                      </div>
                    </div>
                    <div>
                      <div className="text-ink-faint">Traded</div>
                      <div className="mt-0.5 text-ink-muted">{formatDate(trade.transaction_date)}</div>
                    </div>
                    <div>
                      <div className="text-ink-faint">Filed</div>
                      <div className="mt-0.5 text-ink-muted">{formatDate(trade.filing_date)}</div>
                    </div>
                    <div>
                      <div className="text-ink-faint">Days to file</div>
                      <div className={`mt-0.5 ${late ? "text-rose-500 dark:text-rose-400" : "text-ink-muted"}`}>
                        {trade.days_to_file !== null ? `${trade.days_to_file}d${late ? " · late" : ""}` : "—"}
                      </div>
                    </div>
                  </div>

                  <a
                    href={trade.pdf_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-block text-xs text-ink-faint underline decoration-line-strong hover:text-ink"
                  >
                    {trade.parse_status === "ocr" ? "View Scan" : trade.chamber === "senate" ? "View Report" : "View PTR PDF"}
                  </a>
                </div>
              );
            })}
        </div>

        {result && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-muted">
            <span>
              Page {result.data.length ? page : 0} of {result.totalPages} · {result.total.toLocaleString()} trades
            </span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2">
                Show
                <Select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="w-20">
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </label>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-md border border-line px-3 py-1.5 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  disabled={page >= result.totalPages}
                  onClick={() => setPage((p) => Math.min(result.totalPages, p + 1))}
                  className="rounded-md border border-line px-3 py-1.5 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

// Marks a trade extracted via OCR from a scanned paper filing (Senate only,
// currently) — meaningfully less certain than trades read directly from
// text, since OCR can misread a checkbox column or a digit. Shown next to
// the asset name so it travels with the row wherever it's displayed.
function OcrBadge() {
  return (
    <span
      title="Extracted via OCR from a scanned paper filing — verify against the original scan before relying on exact figures."
      className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-600 dark:text-amber-400"
    >
      OCR
    </span>
  );
}

function StatCard({ label, value, note }: { label: string; value: string; note?: string | null }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-2 sm:p-4">
      <div className="truncate text-[9px] uppercase tracking-wide text-ink-faint sm:overflow-visible sm:whitespace-normal sm:text-xs">
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm font-semibold sm:mt-1 sm:overflow-visible sm:whitespace-normal sm:text-xl">
        {value}
      </div>
      {note && <div className="mt-0.5 truncate text-[10px] text-ink-faint sm:text-xs">{note}</div>}
    </div>
  );
}
