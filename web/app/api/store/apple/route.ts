import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { appleApiConfigured, subscriptionStatusFor } from "@/lib/appleStore";
import { upsertSubscription } from "@/lib/subscriptionWrite";

/**
 * The app reporting a purchase, or asking to restore one.
 *
 * Apple's notification is the authority, but it can take a moment to arrive,
 * and the moment it takes is exactly the one where someone has just paid and
 * is still looking at a paywall. So the app says "I have transaction X" and
 * this asks Apple directly.
 *
 * What the app sends is only an identifier, never a claim about entitlement.
 * The answer comes from Apple's own API, so a client that lies about having
 * paid gets nothing; the worst it can do is ask about a transaction that is
 * not its own, which returns that transaction's real state and still ties it
 * to the signed-in account only if Apple says it belongs there.
 */
export async function POST(req: NextRequest) {
  if (!appleApiConfigured()) {
    return NextResponse.json({ error: "App Store API is not configured" }, { status: 503 });
  }

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { originalTransactionId?: string };
  const originalTransactionId = body.originalTransactionId?.trim();
  if (!originalTransactionId) {
    return NextResponse.json({ error: "Missing originalTransactionId" }, { status: 400 });
  }

  let result;
  try {
    result = await subscriptionStatusFor(originalTransactionId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[apple] could not read subscription status", { userId, message });
    return NextResponse.json({ error: `Could not reach the App Store: ${message}` }, { status: 502 });
  }

  if (!result) return NextResponse.json({ entitled: false, reason: "no-subscription" });

  const { status, transaction } = result;

  // The transaction has to belong to this account. appAccountToken is set by
  // the app at purchase time, and a mismatch means someone is presenting
  // somebody else's transaction id: answer honestly about it granting them
  // nothing rather than attaching it to whoever happens to be signed in.
  if (transaction.appAccountToken && transaction.appAccountToken !== userId) {
    console.error("[apple] transaction belongs to another account", { userId, originalTransactionId });
    return NextResponse.json({ entitled: false, reason: "other-account" }, { status: 409 });
  }

  await upsertSubscription({
    clerkUserId: userId,
    provider: "apple",
    providerAccountId: transaction.originalTransactionId ?? originalTransactionId,
    providerSubscriptionId: transaction.transactionId ?? null,
    status,
    productId: transaction.productId ?? null,
    currentPeriodEnd: transaction.expiresDate ? new Date(transaction.expiresDate) : null,
    cancelAtPeriodEnd: status === "canceled",
  });

  return NextResponse.json({ entitled: status === "active" || status === "past_due", status });
}
