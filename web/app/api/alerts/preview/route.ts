import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { hasProServer } from "@/lib/access";
import { normalizeAlertFilters } from "@/lib/alertFilters";
import { previewAlert } from "@/lib/alerts";

/**
 * "This would have matched 14 trades in the last 90 days" — shown live while
 * a Pro user builds an alert, so a filter that turns out to be far too broad
 * (or matches nothing at all) is visible before it's saved rather than after
 * the first email lands.
 *
 * Runs the same conditions the cron will run, so the number is honest.
 */
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to preview alerts." }, { status: 401 });
  if (!(await hasProServer())) {
    return NextResponse.json({ error: "Email alerts are a CongTrade Pro feature." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const preview = await previewAlert(normalizeAlertFilters((body as { filters?: unknown } | null)?.filters));
  return NextResponse.json(preview);
}
