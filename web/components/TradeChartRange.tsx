"use client";

import { useState } from "react";
import { TradeWindowChart, type WindowChartProps } from "@/components/TradeWindowChart";
import { usePriceSeries } from "@/components/usePriceSeries";

type Range = "around" | "today";

/**
 * The trade page's chart with its "Around the trade" / "To today" switch.
 *
 * Drawn in the browser, prices and all: the series comes from /api/prices
 * (one cached answer per ticker), so rendering a trade page on the server
 * neither asks the price source nor draws the chart. The switch lives here
 * too, rather than in a ?range= query, which would make the page render per
 * request.
 */
export function TradeChartRange({
  ticker,
  fromDay,
  aroundEnd,
  ...chart
}: Omit<WindowChartProps, "points"> & { ticker: string; fromDay: string; aroundEnd: string | null }) {
  // To today by default, since that is the headline figure; the close-up
  // around the trade is one tap away.
  const [range, setRange] = useState<Range>("today");
  const series = usePriceSeries(ticker);
  if (series === undefined) {
    // Holds the chart's place while it loads, so nothing below it jumps.
    return <div aria-hidden className="h-[270px] animate-pulse rounded-lg bg-panel-muted" />;
  }
  const points = series?.filter((p) => p.d >= fromDay) ?? [];
  if (points.length <= 4) return null;
  const canToggle = Boolean(aroundEnd && points.filter((p) => p.d > aroundEnd).length > 20);
  const shown = range === "around" && aroundEnd ? points.filter((p) => p.d <= aroundEnd) : points;

  return (
    <>
      {canToggle ? (
        <div className="mb-2 inline-flex rounded-full border border-line p-0.5 text-xs">
          {(["around", "today"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              className={`rounded-full px-3 py-1 ${range === r ? "bg-ink text-panel" : "text-ink-muted hover:text-ink"}`}
            >
              {r === "around" ? "Around the trade" : "To today"}
            </button>
          ))}
        </div>
      ) : null}
      <TradeWindowChart points={shown} {...chart} />
    </>
  );
}
