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
 *
 * `{ "flow": "cancel" }` opens the portal on its cancel confirmation rather
 * than its front page, for the app's "Cancel subscription". Stripe still asks
 * before cancelling, and a subscription it cannot start that flow for (one
 * already set to end, say) gets the front page instead.
 */
export async function POST(req: Request) {
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

  const body = (await req.json().catch(() => ({}))) as { flow?: string };
  const base = { customer: subscription.provider_account_id, return_url: `${SITE_URL}/account` };

  if (body.flow === "cancel" && subscription.provider_subscription_id) {
    try {
      const session = await stripe().billingPortal.sessions.create({
        ...base,
        flow_data: {
          type: "subscription_cancel",
          subscription_cancel: { subscription: subscription.provider_subscription_id },
        },
      });
      return NextResponse.json({ url: session.url });
    } catch {
      // Falls through to the portal's front page, which can cancel too.
    }
  }

  const session = await stripe().billingPortal.sessions.create(base);
  return NextResponse.json({ url: session.url });
}
