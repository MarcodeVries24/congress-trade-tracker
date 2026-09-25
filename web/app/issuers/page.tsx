"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  fetchIssuers,
  formatMarketCap,
  IssuerRow,
  marketCapTierLabel,
  PAGE_SIZE_OPTIONS,
  VOLUME_ESTIMATE_NOTE,
} from "@/lib/api";
import { compactUSD, formatDate } from "@/lib/format";
import { useDebounced } from "@/lib/useDebounced";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Select } from "@/components/Select";
import { AdSlot } from "@/components/AdSlot";
import { OtherAssetsTable } from "@/components/OtherAssetsTable";

type SortField = "trade_count" | "volume_sum" | "politician_count" | "market_cap" | "last_traded";

const SORT_OPTIONS: { value: string; label: string; sort: SortField; order: "asc" | "desc" }[] = [
  { value: "trade_count:desc", label: "Most traded", sort: "trade_count", order: "desc" },
  { value: "trade_count:asc", label: "Least traded", sort: "trade_count", order: "asc" },
  { value: "volume_sum:desc", label: "Highest est. volume", sort: "volume_sum", order: "desc" },
  { value: "politician_count:desc", label: "Most politicians", sort: "politician_count", order: "desc" },
  { value: "market_cap:desc", label: "Largest market cap", sort: "market_cap", order: "desc" },
  { value: "last_traded:desc", label: "Most recently traded", sort: "last_traded", order: "desc" },
];

export default function Issuers() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Hydrated from the URL and written back to it, so a refresh or the back
  // button keeps your place — same arrangement as /trades and /politicians.
  // ?sort= is also how the dashboard's "Most Traded Stocks" card links here,
  // so that spelling has to keep working without an ?order= beside it.
  const initial = useRef(searchParams).current;

  const [q, setQ] = useState(() => initial.get("q") ?? "");
  const [sortValue, setSortValue] = useState(() => {
    const field = initial.get("sort");
    const order = initial.get("order");
    return (
      SORT_OPTIONS.find((o) => o.sort === field && o.order === order)?.value ??
      SORT_OPTIONS.find((o) => o.sort === field)?.value ??
      "trade_count:desc"
    );
  });
  const [page, setPage] = useState(() => Math.max(Number(initial.get("page")) || 1, 1));
  const [pageSize, setPageSize] = useState(() => {
    const v = Number(initial.get("limit"));
    return PAGE_SIZE_OPTIONS.includes(v) ? v : 25;
  });

  const [result, setResult] = useState<{ data: IssuerRow[]; total: number; totalPages: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const debouncedQ = useDebounced(q);
  const activeSort = SORT_OPTIONS.find((o) => o.value === sortValue) ?? SORT_OPTIONS[0];

  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedQ) params.set("q", debouncedQ);
    if (sortValue !== "trade_count:desc") {
      params.set("sort", activeSort.sort);
      params.set("order", activeSort.order);
    }
    if (page !== 1) params.set("page", String(page));
    if (pageSize !== 25) params.set("limit", String(pageSize));
    const query = params.toString();
    router.replace(query ? `/issuers?${query}` : "/issuers", { scroll: false });
  }, [router, debouncedQ, sortValue, activeSort.sort, activeSort.order, page, pageSize]);

  // Not on the first render, which would discard a page number just restored.
  const hydrated = useRef(false);
  useEffect(() => {
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    setPage(1);
  }, [debouncedQ, sortValue]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchIssuers({
      q: debouncedQ || undefined,
      sort: activeSort.sort,
      order: activeSort.order,
      page,
      limit: pageSize,
    })
      .then((res) => {
        if (!cancelled) setResult(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message ?? "Failed to load issuers");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQ, activeSort.sort, activeSort.order, page, pageSize]);

  const rows = result?.data ?? [];

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-base font-semibold tracking-tight sm:text-2xl">Issuers — what Congress trades</h1>
          <p className="mt-1 max-w-2xl text-xs text-ink-muted sm:mt-2 sm:text-sm">
            Companies first, then everything else — bonds, treasuries, funds and private holdings. Trades are disclosed as
            value brackets, never exact figures, so the volume shown is the sum of each trade&apos;s disclosed bracket
            midpoint.
          </p>
        </div>

        <div className="mb-4 sm:mb-6">
          <AdSlot />
        </div>

        <div className="mb-4 flex flex-wrap gap-3 rounded-lg border border-line bg-panel p-4">
          <input
            type="text"
            placeholder="Search a company, ticker or asset…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="min-w-[180px] flex-1 rounded-md border border-line bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-line-strong"
          />
          <Select aria-label="Sort" value={sortValue} onChange={(e) => setSortValue(e.target.value)} className="w-56">
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-rose-800 bg-rose-500/10 px-4 py-3 text-sm text-rose-500 dark:text-rose-300">
            {error}
          </div>
        )}

        <h2 className="mb-3 text-base font-semibold text-ink sm:text-lg">Companies</h2>

        {/* Desktop table */}
        <div className="hidden overflow-x-auto rounded-lg border border-line sm:block">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line bg-panel-muted text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Issuer</th>
                <th className="px-4 py-3">Trades</th>
                <th className="px-4 py-3">Politicians</th>
                <th className="px-4 py-3" title={VOLUME_ESTIMATE_NOTE}>
                  Est. Volume
                </th>
                <th className="px-4 py-3">Market Cap</th>
                <th className="px-4 py-3">Last Traded</th>
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
                    No issuers match this search.
                  </td>
                </tr>
              )}
              {!loading &&
                rows.map((r, i) => (
                  <tr key={r.ticker} className="border-b border-line/50 transition-colors hover:bg-panel-muted">
                    <td className="px-4 py-3 text-ink-faint">{(page - 1) * pageSize + i + 1}</td>
                    <td className="px-4 py-3">
                      <Link href={`/issuers/${r.slug}`} className="block hover:underline">
                        <div className="text-ink">{r.company_name ?? r.ticker}</div>
                        <div className="font-mono text-xs text-ink-faint">{r.ticker}</div>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-ink">{r.trade_count.toLocaleString()}</td>
                    <td className="px-4 py-3 text-ink-muted">{r.politician_count.toLocaleString()}</td>
                    <td className="px-4 py-3 text-ink">{compactUSD.format(r.volume_sum)}</td>
                    <td className="px-4 py-3 text-ink-muted" title={marketCapTierLabel(r.market_cap)}>
                      {formatMarketCap(r.market_cap) ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{formatDate(r.last_traded)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="space-y-2 sm:hidden">
          {loading && <div className="rounded-lg border border-line bg-panel px-4 py-8 text-center text-sm text-ink-faint">Loading…</div>}
          {!loading && rows.length === 0 && (
            <div className="rounded-lg border border-line bg-panel px-4 py-8 text-center text-sm text-ink-faint">No issuers match this search.</div>
          )}
          {!loading &&
            rows.map((r) => (
              <Link
                key={r.ticker}
                href={`/issuers/${r.slug}`}
                className="flex items-center gap-3 rounded-lg border border-line bg-panel px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-ink">{r.company_name ?? r.ticker}</div>
                  <div className="truncate font-mono text-xs text-ink-faint">
                    {r.ticker}
                    {formatMarketCap(r.market_cap) ? ` · ${formatMarketCap(r.market_cap)} cap` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-sm font-semibold text-ink">{compactUSD.format(r.volume_sum)}</div>
                  <div className="text-[10px] uppercase tracking-wide text-ink-faint">
                    {r.trade_count.toLocaleString()} trade{r.trade_count === 1 ? "" : "s"} · {r.politician_count} member
                    {r.politician_count === 1 ? "" : "s"}
                  </div>
                </div>
              </Link>
            ))}
        </div>

        <p className="mt-3 border-x border-transparent px-4 text-[11px] leading-snug text-ink-faint">{VOLUME_ESTIMATE_NOTE}</p>

        {result && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-muted">
            <div className="flex items-center gap-2">
              <span>Show</span>
              <Select aria-label="Page size" value={String(pageSize)} onChange={(e) => setPageSize(Number(e.target.value))} className="w-20">
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </Select>
              <span>
                Page {page} of {result.totalPages || 1} · {result.total.toLocaleString()} issuers
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

        <OtherAssetsTable query={debouncedQ} />

        <div className="mt-6">
          <AdSlot />
        </div>
      </main>
      <Footer />
    </>
  );
}
