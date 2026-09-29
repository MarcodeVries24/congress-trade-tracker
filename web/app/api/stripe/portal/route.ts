import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";
import { billingConfigured } from "@/lib/stripePrices";
import { getSubscriptionFor } from "@/lib/subscription";
import { SITE_URL } from "@/lib/site";

/**
 * Stripe's own billing portal: change card, switch plan, download invoices,
 * cancel. Everything the site promises under "cancel any time" happens here,
 * which means none of it is ours to build or to get wrong.
 */
export async function POST() {
  if (!billingConfigured()) {
    return NextResponse.json({ error: "Billing is not configured" }, { status: 503 });
  }

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  // The Stripe row specifically: a customer of the billing portal is a Stripe
  // customer, and an App Store subscriber is managed in the App Store.
  const subscription = await getSubscriptionFor(userId, "stripe");
  // The column is nullable now, because a store subscription has no Stripe
  // customer. A Stripe row without one should not exist, but the portal cannot
  // be opened without it either way, so it is refused rather than asserted.
  if (!subscription?.provider_account_id) {
    return NextResponse.json({ error: "No subscription to manage" }, { status: 404 });
  }

  const session = await stripe().billingPortal.sessions.create({
    customer: subscription.provider_account_id,
    return_url: `${SITE_URL}/account`,
  });

  return NextResponse.json({ url: session.url });
}
