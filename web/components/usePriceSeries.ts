"use client";

import { useEffect, useState } from "react";
import type { PricePoint } from "@/lib/priceSeries";

// One request per ticker per page view, however many charts ask.
const requests = new Map<string, Promise<PricePoint[] | null>>();

function load(ticker: string): Promise<PricePoint[] | null> {
  const key = ticker.toUpperCase();
  let hit = requests.get(key);
  if (!hit) {
    hit = fetch(`/api/prices/${encodeURIComponent(key)}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ points?: PricePoint[] }>) : null))
      .then((d) => d?.points ?? null)
      .catch(() => null);
    requests.set(key, hit);
  }
  return hit;
}

/**
 * A ticker's daily closes, loaded in the browser from /api/prices: the whole
 * series, one cached answer per ticker at the CDN, which each chart cuts to
 * the days it shows. Drawing the charts here keeps the price source and the
 * chart work out of the server render of every trade and company page.
 *
 * undefined while loading, null when there is no series.
 */
export function usePriceSeries(ticker: string | null): PricePoint[] | null | undefined {
  const [state, setState] = useState<{ ticker: string | null; points: PricePoint[] | null } | null>(null);
  useEffect(() => {
    if (!ticker) return;
    let live = true;
    void load(ticker).then((points) => live && setState({ ticker, points }));
    return () => {
      live = false;
    };
  }, [ticker]);
  if (!ticker) return null;
  return state && state.ticker === ticker ? state.points : undefined;
}
