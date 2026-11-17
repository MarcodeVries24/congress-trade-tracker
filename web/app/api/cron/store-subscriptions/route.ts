import { NextRequest, NextResponse } from "next/server";
import { refreshAllLapsedStoreRows } from "@/lib/storeRefresh";

/**
 * Daily, from Vercel Cron (web/vercel.json): every App Store and Google Play
 * subscription whose paid period has run out without a notification saying
 * so is checked with the store. Reading someone's account does the same for
 * them; this covers the people who do not open the app, so the alert sender
 * stops treating an ended subscription as paid.
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` when that variable is
 * set, and nothing runs without it.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await refreshAllLapsedStoreRows();
  console.info("[store-refresh] daily sweep", result);
  return NextResponse.json(result);
}
