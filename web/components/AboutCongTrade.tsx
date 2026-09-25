"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Logo } from "./Logo";
import type { Provenance } from "@/lib/provenance";

/**
 * Why any of this should be believed.
 *
 * Deliberately not a mission statement. Every tracker claims accurate data, so
 * the claim is worthless; what is worth saying is the thing most of them can't
 * — that a scan we can't read confidently is held back and reviewed by hand
 * rather than published as a guess, and that every row on the site links to
 * the filing it came from. The counts are here so a sceptic can check the
 * claim instead of taking it.
 */

function Stat({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel-muted px-3 py-2.5" title={hint}>
      <div className="text-base font-semibold leading-none text-ink sm:text-lg">{value}</div>
      <div className="mt-1.5 text-[11px] leading-tight text-ink-faint">{label}</div>
    </div>
  );
}

export function AboutCongTrade() {
  const [data, setData] = useState<Provenance | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/provenance")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Provenance) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const n = (v: number) => v.toLocaleString("en-US");

  return (
    <section className="overflow-hidden rounded-xl border border-line bg-panel">
      <div className="flex flex-col gap-6 px-4 py-5 sm:flex-row sm:items-start sm:gap-8 sm:px-6 sm:py-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <span className="text-ink">
              <Logo size={26} />
            </span>
            <span className="text-lg font-bold tracking-tight">
              <span className="text-ink">Cong</span>
              <span className="text-accent">Trade</span>
            </span>
          </div>

          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-muted">
            Members of Congress must disclose their trades within 45 days, on a form filed with the House Clerk or the
            Senate. CongTrade reads every one of those filings as it appears — automatically, every four hours — and
            turns them into something you can actually search.
          </p>
          <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-ink-muted">
            Plenty of filings arrive as scans rather than text. Where the machine reading of one isn&rsquo;t trustworthy,
            it is <span className="text-ink">held back and checked by hand against the original</span> rather than
            published as a guess — which is why a few numbers here differ from other trackers, and why every row on this
            site links straight to the document it came from. Nothing is typed in by us.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
            <Link href="/about" className="text-accent underline decoration-line-strong hover:decoration-current">
              How the data is built
            </Link>
            <a href="https://disclosures-clerk.house.gov/PublicDisclosure/FinancialDisclosure" target="_blank" rel="noreferrer"
              className="text-ink-muted underline decoration-line hover:text-ink">
              House Clerk
            </a>
            <a href="https://efdsearch.senate.gov/search/home/" target="_blank" rel="noreferrer"
              className="text-ink-muted underline decoration-line hover:text-ink">
              Senate eFD
            </a>
          </div>
        </div>

        <div className="grid w-full shrink-0 grid-cols-2 gap-2.5 sm:w-[300px] sm:grid-cols-2">
          {data ? (
            <>
              <Stat value={n(data.filings)} label="Filings read" hint="Every Periodic Transaction Report published since 2015." />
              <Stat value={n(data.trades)} label="Trades published" hint="Only from filings we trust — see the other two figures." />
              <Stat value={n(data.handVerified)} label="Checked by hand" hint="Scanned filings verified line by line against the original document." />
              <Stat
                value={data.awaitingReview === 0 ? "None" : n(data.awaitingReview)}
                label="Unreviewed, held back"
                hint="Filings whose machine reading isn't trusted yet. These are never shown as trades."
              />
            </>
          ) : (
            [0, 1, 2, 3].map((i) => <div key={i} className="h-[62px] animate-pulse rounded-lg border border-line bg-panel-muted" />)
          )}
        </div>
      </div>
    </section>
  );
}
