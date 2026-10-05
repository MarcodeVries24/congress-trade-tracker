import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DEFAULT_TIMING_WINDOW, TIMING_WINDOWS, type TimingWindow } from "@/lib/timing";
import { BEST_TRADES_METADATA, BestTradesView } from "../BestTradesView";

// The shorter periods, each a cached page of its own; the default lives at
// /best-trades itself.
export const revalidate = 3600;
export const dynamicParams = false;

export function generateStaticParams() {
  return TIMING_WINDOWS.filter((d) => d !== DEFAULT_TIMING_WINDOW).map((d) => ({ days: String(d) }));
}

export async function generateMetadata({ params }: { params: Promise<{ days: string }> }): Promise<Metadata> {
  const { days } = await params;
  return { ...BEST_TRADES_METADATA, alternates: { canonical: `/best-trades/${days}` } };
}

export default async function BestTradesForPeriod({ params }: { params: Promise<{ days: string }> }) {
  const days = Number((await params).days);
  if (!(TIMING_WINDOWS as readonly number[]).includes(days) || days === DEFAULT_TIMING_WINDOW) notFound();
  return <BestTradesView days={days as TimingWindow} />;
}
