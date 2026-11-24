import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { setPushReminders } from "@/lib/pushDevices";

/**
 * The app's switch for the occasional reminder that new trades were published
 * (ingest/src/alerts/sendReminders.ts). Apart from the switch for push on a
 * phone, so it can be turned off without losing the alerts. Per account, not
 * per phone, as the reminder is.
 */
export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to manage notifications." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { on?: unknown } | null;
  if (!body || typeof body.on !== "boolean") return NextResponse.json({ error: "Missing on." }, { status: 400 });
  await setPushReminders(userId, body.on);
  return NextResponse.json({ ok: true });
}
