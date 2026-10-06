"use client";

import { PriceTradesChart, type ChartTrade } from "@/components/PriceTradesChart";
import { usePriceSeries } from "@/components/usePriceSeries";

/**
 * The company page's price chart, drawn in the browser from the ticker's
 * cached series (see usePriceSeries), so rendering the page on the server
 * neither asks the price source nor draws some 140 KB of chart.
 */
export function PriceTradesChartLive({
  ticker,
  fromDay,
  trades,
}: {
  ticker: string;
  fromDay: string;
  trades: ChartTrade[];
}) {
  const series = usePriceSeries(ticker);
  if (series === undefined) return <div aria-hidden className="mt-5 h-[300px] animate-pulse rounded-lg bg-panel-muted" />;
  const points = series?.filter((p) => p.d >= fromDay) ?? [];
  if (points.length < 10) return null;
  return (
    <div className="mt-5">
      <PriceTradesChart ticker={ticker} points={points} trades={trades} />
    </div>
  );
}
