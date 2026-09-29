import { NextRequest, NextResponse } from "next/server";
import { appleConfigured, statusForNotification, verifyNotification, verifyTransaction } from "@/lib/appleStore";
import { claimStoreEvent } from "@/lib/storeEvents";
import { upsertSubscription } from "@/lib/subscriptionWrite";

/**
 * App Store Server Notifications V2.
 *
 * Apple tells us when a subscription starts, renews, lapses or is refunded.
 * The app also reports its own purchases, but this is the authority: a phone
 * can be lied to and can be offline when a renewal fails, and neither is true
 * of this endpoint.
 *
 * Shaped like the Stripe webhook on purpose. Verify first, claim the id
 * second, apply third, and answer 200 to anything already applied so Apple
 * stops retrying. Apple retries for five days on a non-200, which is generous
 * enough that an endpoint erroring on a duplicate would hammer itself.
 */
export async function POST(req: NextRequest) {
  if (!appleConfigured()) {
    return NextResponse.json({ error: "Apple notifications are not configured" }, { status: 503 });
  }

  const body = (await req.json().catch(() => null)) as { signedPayload?: string } | null;
  if (!body?.signedPayload) {
    return NextResponse.json({ error: "Missing signedPayload" }, { status: 400 });
  }

  let notification;
  try {
    notification = await verifyNotification(body.signedPayload);
  } catch (err) {
    // A payload that does not verify is not from Apple. 400 rather than 500:
    // it is the sender's problem, and Apple will not retry its way out of it.
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[apple] notification failed verification", { message });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const { notificationType, subtype, notificationUUID, data } = notification;
  if (!notificationUUID) return NextResponse.json({ error: "Missing notificationUUID" }, { status: 400 });

  // Claimed before any work, so a redelivery cannot apply the same change twice.
  if (!(await claimStoreEvent("apple", notificationUUID, notificationType ?? "unknown"))) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const status = statusForNotification(notificationType ?? "", subtype);
  if (!status || !data?.signedTransactionInfo) {
    // Nothing we act on. Still a 200: Apple has delivered it, and asking to be
    // told again about something we deliberately ignore helps nobody.
    return NextResponse.json({ received: true, ignored: notificationType ?? null });
  }

  let transaction;
  try {
    transaction = await verifyTransaction(data.signedTransactionInfo);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[apple] transaction failed verification", { notificationUUID, message });
    return NextResponse.json({ error: "Invalid transaction" }, { status: 400 });
  }

  // appAccountToken is the Clerk user id, set by the app when it starts the
  // purchase. It is the only thing tying a receipt to an account, which is why
  // the app must always send it and why a purchase without one is recorded
  // nowhere rather than guessed at.
  const clerkUserId = transaction.appAccountToken;
  if (!clerkUserId) {
    console.error("[apple] transaction carries no appAccountToken", {
      notificationUUID,
      originalTransactionId: transaction.originalTransactionId,
    });
    return NextResponse.json({ received: true, unlinked: true });
  }

  await upsertSubscription({
    clerkUserId,
    provider: "apple",
    // Every renewal of one subscription shares its original transaction id,
    // which makes it the stable handle for the subscription itself.
    providerAccountId: transaction.originalTransactionId ?? null,
    providerSubscriptionId: transaction.transactionId ?? null,
    status,
    productId: transaction.productId ?? null,
    currentPeriodEnd: transaction.expiresDate ? new Date(transaction.expiresDate) : null,
    cancelAtPeriodEnd: status === "canceled",
  });

  return NextResponse.json({ received: true });
}
