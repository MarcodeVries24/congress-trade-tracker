import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { appleApiConfigured, describeAppleError, subscriptionStatusFor } from "@/lib/appleStore";
import { accountStillExists, appleSubscriptionOwner, releaseStoreSubscription } from "@/lib/storeAccountToken";
import { grantsAccess } from "@/lib/subscription";
import { upsertSubscription } from "@/lib/subscriptionWrite";
import { subscriptionElsewhereMessage } from "@congtrade/shared/storeProducts";

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
    const message = describeAppleError(err);
    console.error("[apple] could not read subscription status", { userId, message });
    return NextResponse.json({ error: `Could not reach the App Store: ${message}` }, { status: 502 });
  }

  if (!result) return NextResponse.json({ entitled: false, reason: "no-subscription" });

  const { status, transaction } = result;

  // The subscription has to belong to this account: the one that holds it, or
  // for a new one, the one its token names (the UUID we issued, which is all
  // StoreKit will carry); see lib/appleOwner. Going by the token alone missed
  // a subscription held by another account whose plan this one had changed,
  // and recording it here then failed on the row that was already there.
  // While the other account exists it keeps it: one Apple Account's
  // subscription does not unlock several CongTrade accounts. Once it has
  // been deleted (or the token was never ours to resolve), the subscription
  // belongs to nobody, and it moves to the account restoring it, so someone
  // who deleted their account and made a new one is not locked out of what
  // they are still paying for.
  const subscriptionId = transaction.originalTransactionId ?? originalTransactionId;
  const owner = await appleSubscriptionOwner(subscriptionId, transaction.appAccountToken);
  if (owner !== userId) {
    if (owner && (await accountStillExists(owner))) {
      console.error("[apple] transaction belongs to another account", { userId, originalTransactionId });
      // When that account's Pro ends, and whether it renews, so the person
      // knows when they could subscribe here instead. The app writes the date
      // in the phone's time zone from `until`; the sentence here, in UTC, is
      // for builds that only show `error`.
      const until = transaction.expiresDate ? new Date(transaction.expiresDate) : null;
      const renews = status !== "canceled";
      const untilText = until
        ? until.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
        : null;
      return NextResponse.json(
        {
          entitled: false,
          reason: "other-account",
          until: until?.toISOString() ?? null,
          renews,
          error: subscriptionElsewhereMessage("apple", untilText, renews),
        },
        { status: 409 }
      );
    }
    if (owner) console.info("[apple] subscription moved from a deleted account", { userId, from: owner, originalTransactionId });
  }
  // One subscription, one row: whoever held it before, it is this account's now.
  await releaseStoreSubscription("apple", subscriptionId, userId);

  const currentPeriodEnd = transaction.expiresDate ? new Date(transaction.expiresDate) : null;
  await upsertSubscription({
    clerkUserId: userId,
    provider: "apple",
    providerAccountId: subscriptionId,
    providerSubscriptionId: transaction.transactionId ?? null,
    status,
    productId: transaction.productId ?? null,
    currentPeriodEnd,
    cancelAtPeriodEnd: status === "canceled",
  });

  // The same rule as everywhere else access is decided: a cancelled
  // subscription keeps Pro to the end of the period paid for. Answering
  // "active or past_due" alone told someone restoring a cancelled one, still
  // paid up, that they had nothing.
  const entitled = grantsAccess({
    clerk_user_id: userId,
    provider: "apple",
    provider_account_id: subscriptionId,
    provider_subscription_id: transaction.transactionId ?? null,
    status,
    product_id: transaction.productId ?? null,
    current_period_end: currentPeriodEnd?.toISOString() ?? null,
    cancel_at_period_end: status === "canceled",
  });
  return NextResponse.json({ entitled, status });
}
