import { NextRequest, NextResponse } from "next/server";
import { fetchSubscriptionState, googleConfigured } from "@/lib/googleStore";
import { claimStoreEvent } from "@/lib/storeEvents";
import { upsertSubscription } from "@/lib/subscriptionWrite";

/**
 * Google Play real-time developer notifications, delivered by Pub/Sub push.
 *
 * Play sends a purchase token and nothing else, so unlike Apple and Stripe this
 * handler has to go and ask what happened. That makes it the one webhook that
 * can fail because a third party is down, which is why a fetch failure answers
 * non-200 and lets Pub/Sub redeliver rather than swallowing it.
 *
 * Pub/Sub push has no signature. The endpoint is protected by a shared secret
 * in the query string, which is what Google's own docs recommend for a push
 * subscription and is why the URL registered in Pub/Sub must be treated as a
 * credential rather than an address.
 */
export async function POST(req: NextRequest) {
  if (!googleConfigured()) {
    return NextResponse.json({ error: "Play notifications are not configured" }, { status: 503 });
  }

  const expected = process.env.GOOGLE_PUBSUB_VERIFICATION_TOKEN;
  if (req.nextUrl.searchParams.get("token") !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const envelope = (await req.json().catch(() => null)) as {
    message?: { data?: string; messageId?: string };
  } | null;
  const encoded = envelope?.message?.data;
  const messageId = envelope?.message?.messageId;
  if (!encoded || !messageId) {
    return NextResponse.json({ error: "Malformed Pub/Sub envelope" }, { status: 400 });
  }

  let notification: {
    subscriptionNotification?: { purchaseToken?: string; notificationType?: number };
    testNotification?: unknown;
  };
  try {
    notification = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
  } catch {
    return NextResponse.json({ error: "Malformed notification payload" }, { status: 400 });
  }

  // Google sends one of these when the Pub/Sub topic is first wired up. It
  // carries no purchase, and answering 200 is how the console confirms the
  // endpoint works.
  if (notification.testNotification) return NextResponse.json({ received: true, test: true });

  const purchaseToken = notification.subscriptionNotification?.purchaseToken;
  if (!purchaseToken) return NextResponse.json({ received: true, ignored: true });

  if (!(await claimStoreEvent("google", messageId, String(notification.subscriptionNotification?.notificationType ?? "unknown")))) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  let state;
  try {
    state = await fetchSubscriptionState(purchaseToken);
  } catch (err) {
    // Non-200 on purpose: Pub/Sub will redeliver, and an entitlement delayed
    // by a Play outage is recoverable where one dropped is not. The claimed
    // event id is released so the retry is not treated as a duplicate.
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[google] could not read subscription state", { messageId, message });
    await releaseStoreEvent(messageId);
    return NextResponse.json({ error: "Could not read subscription state" }, { status: 503 });
  }

  if (!state.clerkUserId) {
    console.error("[google] purchase carries no obfuscatedExternalAccountId", { messageId });
    return NextResponse.json({ received: true, unlinked: true });
  }

  await upsertSubscription({
    clerkUserId: state.clerkUserId,
    provider: "google",
    // The purchase token is the stable handle, except that an upgrade issues a
    // new one and points it at the old via linkedPurchaseToken.
    providerAccountId: purchaseToken,
    providerSubscriptionId: state.linkedPurchaseToken ?? purchaseToken,
    status: state.status,
    productId: state.productId,
    currentPeriodEnd: state.expiryTimeMillis ? new Date(state.expiryTimeMillis) : null,
    cancelAtPeriodEnd: state.cancelAtPeriodEnd,
  });

  return NextResponse.json({ received: true });
}

/** Undoes a claim so a redelivery is allowed to try again. */
async function releaseStoreEvent(messageId: string): Promise<void> {
  const { sql } = await import("@/lib/db");
  await sql
    .query(`DELETE FROM store_events WHERE provider = $1 AND id = $2`, ["google", messageId])
    .catch(() => {});
}
