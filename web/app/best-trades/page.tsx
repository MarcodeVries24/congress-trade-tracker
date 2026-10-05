import type { Metadata } from "next";
import { DEFAULT_TIMING_WINDOW } from "@/lib/timing";
import { BEST_TRADES_METADATA, BestTradesView } from "./BestTradesView";

export const metadata: Metadata = { ...BEST_TRADES_METADATA, alternates: { canonical: "/best-trades" } };

// Cached for an hour, like the figures behind it. The other periods have
// their own address (/best-trades/30, /best-trades/90) rather than a ?days=
// query, because a page that reads its query string is rendered on every
// request, crawlers included.
export const revalidate = 3600;

export default function BestTradesPage() {
  return <BestTradesView days={DEFAULT_TIMING_WINDOW} />;
}
