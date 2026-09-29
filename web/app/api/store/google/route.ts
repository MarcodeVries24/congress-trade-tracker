import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { fetchSubscriptionState, googleApiConfigured } from "@/lib/googleStore";
import { accountTokenFor } from "@/lib/storeAccountToken";
import { upsertSubscription } from "@/lib/subscriptionWrite";

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
    return NextResponse.json({ entitled: false, reason: "other-account" }, { status: 409 });
  }

  await upsertSubscription({
    clerkUserId: userId,
    provider: "google",
    providerAccountId: purchaseToken,
    providerSubscriptionId: state.linkedPurchaseToken ?? purchaseToken,
    status: state.status,
    productId: state.productId,
    currentPeriodEnd: state.expiryTimeMillis ? new Date(state.expiryTimeMillis) : null,
    cancelAtPeriodEnd: state.cancelAtPeriodEnd,
  });

  return NextResponse.json({
    entitled: state.status === "active" || state.status === "past_due",
    status: state.status,
  });
}
