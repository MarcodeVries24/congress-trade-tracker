import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { acknowledgeIfPending, fetchSubscriptionState, googleApiConfigured } from "@/lib/googleStore";
import { accountTokenFor } from "@/lib/storeAccountToken";
import { grantsAccess } from "@/lib/subscription";
import { upsertSubscription } from "@/lib/subscriptionWrite";
import { subscriptionElsewhereMessage } from "@congtrade/shared/storeProducts";

/**
 * The app reporting a Play purchase, or asking to restore one.
 *
 * The Android half of /api/store/apple, and the same rule: the app sends a
 * purchase token, never a claim about entitlement, and the answer comes from
 * Play. Play's notification is still the authority, but it travels through
 * Pub/Sub and can take longer than the moment someone spends staring at a
 * paywall they have just paid to get past.
 */
export async function POST(req: NextRequest) {
  if (!googleApiConfigured()) {
    return NextResponse.json({ error: "Play API is not configured" }, { status: 503 });
  }

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { purchaseToken?: string };
  const purchaseToken = body.purchaseToken?.trim();
  if (!purchaseToken) return NextResponse.json({ error: "Missing purchaseToken" }, { status: 400 });

  let state;
  try {
    state = await fetchSubscriptionState(purchaseToken);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[google] could not read subscription state", { userId, message });
    return NextResponse.json({ error: `Could not reach Play: ${message}` }, { status: 502 });
  }

  // obfuscatedExternalAccountId is the UUID the app attached at purchase time.
  // A purchase carrying somebody else's is not this person's to claim.
  const expectedToken = await accountTokenFor(userId);
  if (state.clerkUserId && state.clerkUserId !== expectedToken) {
    console.error("[google] purchase belongs to another account", { userId });
    // Only `error`, without the `until` Apple's route sends: builds up to 14
    // word a date themselves as if it were always Apple's.
    const until = state.expiryTimeMillis
      ? new Date(state.expiryTimeMillis).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        })
      : null;
    const renews = state.status !== "canceled" && !state.cancelAtPeriodEnd;
    return NextResponse.json(
      { entitled: false, reason: "other-account", error: subscriptionElsewhereMessage("google", until, renews) },
      { status: 409 }
    );
  }

  const currentPeriodEnd = state.expiryTimeMillis ? new Date(state.expiryTimeMillis) : null;
  const providerSubscriptionId = state.linkedPurchaseToken ?? purchaseToken;
  await upsertSubscription({
    clerkUserId: userId,
    provider: "google",
    providerAccountId: purchaseToken,
    providerSubscriptionId,
    status: state.status,
    productId: state.productId,
    currentPeriodEnd,
    cancelAtPeriodEnd: state.cancelAtPeriodEnd,
  });

  await acknowledgeIfPending(purchaseToken, state);

  // The same rule as everywhere else access is decided, as in the Apple route:
  // a cancelled subscription keeps Pro to the end of the period paid for.
  const entitled = grantsAccess({
    clerk_user_id: userId,
    provider: "google",
    provider_account_id: purchaseToken,
    provider_subscription_id: providerSubscriptionId,
    status: state.status,
    product_id: state.productId,
    current_period_end: currentPeriodEnd?.toISOString() ?? null,
    cancel_at_period_end: state.cancelAtPeriodEnd,
  });
  return NextResponse.json({ entitled, status: state.status });
}
