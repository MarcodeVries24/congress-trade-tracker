"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ASSET_TYPE_LABELS, VOLUME_ESTIMATE_NOTE } from "@/lib/api";
import { compactUSD, formatDate } from "@/lib/format";
import type { AssetGroup } from "@/lib/issuers";

/**
 * The half of the corpus that has no ticker: municipal bonds, treasuries,
 * corporate paper, funds, private partnerships.
 *
 * Separated from the company table rather than mixed into it because the two
 * are identified differently and only one of them is exact. A company is a
 * symbol; these are grouped from the text of the filing, which writes each
 * maturity and coupon as its own name — so this list is a good guide to what
 * Congress holds and a poor one to exactly how many distinct issuers there
 * are. The page says so rather than implying a precision it hasn't got.
 */

const PAGE = 25;

export function OtherAssetsTable({ query }: { query: string }) {
  const [rows, setRows] = useState<AssetGroup[] | null>(null);
  const [total, setTotal] = useState(0);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ limit: String(showAll ? 5000 : PAGE) });
    if (query) params.set("q", query);
    fetch(`/api/other-assets?${params}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { data: AssetGroup[]; total: number }) => {
        if (cancelled) return;
        setRows(d.data);
        setTotal(d.total);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [query, showAll]);

  const typeLabel = (t: string | null) => (t ? (ASSET_TYPE_LABELS[t] ?? t) : "Unspecified");
  const tradesHref = (name: string) => `/trades?q=${encodeURIComponent(name.split(" ").slice(0, 3).join(" "))}&assetTypes=any`;

  return (
    <section className="mt-8 sm:mt-10">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h2 className="text-base font-semibold text-ink sm:text-lg">Everything else Congress trades</h2>
          <p className="mt-1 max-w-3xl text-xs text-ink-muted sm:text-[13px]">
            Municipal bonds, treasuries, corporate paper, funds and private partnerships — the assets that carry no
            ticker, so they can&apos;t sit in the table above. Grouped from the text of each filing, which writes every
            maturity and coupon as its own name, so treat these as families rather than exact issuers.
          </p>
        </div>
        {total > PAGE && (
          <button onClick={() => setShowAll((v) => !v)} className="shrink-0 text-xs text-accent hover:underline">
            {showAll ? "Show top 25" : `View all ${total.toLocaleString()} →`}
          </button>
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border border-line sm:block">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-line bg-panel-muted text-left text-xs uppercase tracking-wide text-ink-faint">
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Asset</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Trades</th>
              <th className="px-4 py-3" title={VOLUME_ESTIMATE_NOTE}>
                Est. Volume
              </th>
              <th className="px-4 py-3">Last Traded</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-faint">
                  Loading…
                </td>
              </tr>
            )}
            {rows?.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-ink-faint">
                  Nothing here matches this search.
                </td>
              </tr>
            )}
            {rows?.map((r, i) => (
              <tr key={r.name} className="border-b border-line/50 transition-colors hover:bg-panel-muted">
                <td className="px-4 py-3 text-ink-faint">{i + 1}</td>
                <td className="px-4 py-3">
                  <Link href={tradesHref(r.name)} className="text-ink hover:underline">
                    {r.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-ink-muted">{typeLabel(r.type)}</td>
                <td className="px-4 py-3 text-ink">{r.trade_count.toLocaleString()}</td>
                <td className="px-4 py-3 text-ink">{compactUSD.format(r.volume_sum)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{formatDate(r.last_traded)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 sm:hidden">
        {rows === null && (
          <div className="rounded-lg border border-line bg-panel px-4 py-8 text-center text-sm text-ink-faint">Loading…</div>
        )}
        {rows?.map((r) => (
          <Link key={r.name} href={tradesHref(r.name)} className="flex items-center gap-3 rounded-lg border border-line bg-panel px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm text-ink">{r.name}</div>
              <div className="truncate text-xs text-ink-faint">{typeLabel(r.type)}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm font-semibold text-ink">{compactUSD.format(r.volume_sum)}</div>
              <div className="text-[10px] uppercase tracking-wide text-ink-faint">
                {r.trade_count.toLocaleString()} trade{r.trade_count === 1 ? "" : "s"}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
