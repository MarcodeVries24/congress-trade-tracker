"use client";

import { useState } from "react";
import type { PricePoint } from "@/lib/priceSeries";
import { TradeWindowChart, type WindowChartProps } from "@/components/TradeWindowChart";

type Range = "around" | "today";

/**
 * The trade page's chart with its "Around the trade" / "To today" switch.
 *
 * The switch lives here, in the browser, rather than in a ?range= query: a
 * page that reads its query string has to be rendered per request, and the
 * trade pages are cached so a crawler working through all of them does not
 * run the server for each one.
 */
export function TradeChartRange({
  points,
  aroundEnd,
  canToggle,
  ...chart
}: Omit<WindowChartProps, "points"> & { points: PricePoint[]; aroundEnd: string | null; canToggle: boolean }) {
  // To today by default, since that is the headline figure; the close-up
  // around the trade is one tap away.
  const [range, setRange] = useState<Range>("today");
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
