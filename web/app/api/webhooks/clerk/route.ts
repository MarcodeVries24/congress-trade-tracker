import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { enforceSessionLimit, MAX_CONCURRENT_SESSIONS } from "@/lib/sessionLimit";

/**
 * Clerk webhooks. Subscribed to `session.created` only.
 *
 * Signature-verified with svix, because this endpoint has to be reachable
 * without a session — anything that can POST here could otherwise sign a user
 * out of their own devices.
 */

const SIGNING_SECRET = process.env.CLERK_WEBHOOK_SIGNING_SECRET;

type ClerkEvent = { type: string; data: { id?: string; user_id?: string } };

export async function POST(req: NextRequest) {
  if (!SIGNING_SECRET) {
    console.error("CLERK_WEBHOOK_SIGNING_SECRET is not set; refusing the webhook.");
    return new NextResponse("Not configured", { status: 500 });
  }

  const body = await req.text();
  const headers = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  let event: ClerkEvent;
  try {
    event = new Webhook(SIGNING_SECRET).verify(body, headers) as ClerkEvent;
  } catch {
    return new NextResponse("Invalid signature", { status: 400 });
  }

  if (event.type !== "session.created") return NextResponse.json({ ok: true });

  const userId = event.data.user_id;
  if (!userId) return NextResponse.json({ ok: true });

  try {
    const revoked = await enforceSessionLimit(userId);
    if (revoked.length) {
      console.log(`session limit: signed ${userId} out of ${revoked.length} older browser(s), keeping ${MAX_CONCURRENT_SESSIONS}`);
    }
  } catch (err) {
    // A 500 makes Clerk retry, which is right: the cap should hold even if
    // this call failed once. The sign-in itself already succeeded either way.
    console.error(`session limit failed for ${userId}: ${(err as Error).message}`);
    return new NextResponse("Retry", { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
