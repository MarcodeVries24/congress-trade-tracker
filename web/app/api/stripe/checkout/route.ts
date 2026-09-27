import { NextRequest, NextResponse } from "next/server";
import { auth, currentUser } from "@clerk/nextjs/server";
import { stripe, priceIdFor, billingConfigured, type BillingPeriod } from "@/lib/stripe";
import { currencyForRequest } from "@/lib/currency";
import { getSubscription } from "@/lib/subscription";
import { SITE_URL } from "@/lib/site";

/**
 * Starts a Stripe Checkout session for the signed-in user.
 *
 * Which payment methods appear is decided in the Stripe dashboard, not here:
 * card, iDEAL, SEPA Direct Debit, Bancontact, Apple Pay and Google Pay all
 * surface automatically for the buyer's country once enabled there. That is
 * the whole reason for going direct to Stripe.
 */
export async function POST(req: NextRequest) {
  if (!billingConfigured()) {
    return NextResponse.json({ error: "Billing is not configured" }, { status: 503 });
  }

  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { period?: BillingPeriod; returnTo?: string };
  const period: BillingPeriod = body.period === "annual" ? "annual" : "monthly";

  // Reuse the customer if this person has ever paid, so Stripe keeps one
  // customer per human rather than one per checkout.
  const existing = await getSubscription(userId);
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress;

  // Where checkout lets them out: back to the alert they were building, or to
  // their account, never to the pricing page they just bought from.
  const returnTo = typeof body.returnTo === "string" && body.returnTo.startsWith("/") ? body.returnTo : "/account";

  // Decided here rather than taken from the request body, and by the same
  // rule the pricing page used to render: a client that could name its own
  // currency could name the cheaper one.
  const currency = await currencyForRequest();

  // Stripe Tax is not ignored when it is unconfigured: asking for it on an
  // account with no registered origin address fails the whole session, which
  // is a dead Subscribe button rather than a missing VAT line. So it is opt-in,
  // switched on once Tax is actually set up in the dashboard.
  const automaticTax = process.env.STRIPE_AUTOMATIC_TAX === "true";

  try {
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceIdFor(period, currency), quantity: 1 }],
      ...(existing ? { customer: existing.stripe_customer_id } : email ? { customer_email: email } : {}),
      // The link back to the Clerk user. Stripe echoes this on every event for
      // the resulting subscription, which is what lets the webhook know whose
      // access to open without a lookup table of its own.
      client_reference_id: userId,
      subscription_data: { metadata: { clerk_user_id: userId } },
      metadata: { clerk_user_id: userId },
      allow_promotion_codes: true,
      automatic_tax: { enabled: automaticTax },
      billing_address_collection: automaticTax ? "required" : "auto",
      success_url: `${SITE_URL}${returnTo}${returnTo.includes("?") ? "&" : "?"}checkout=success`,
      cancel_url: `${SITE_URL}/upgrade?checkout=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    // Stripe refuses a session for reasons that are ours to fix and are
    // invisible from the browser: an unactivated account, a price id from the
    // other mode, Tax without an origin address. Say which, in the log and to
    // the buyer, rather than letting it become an opaque 500.
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[stripe] checkout session failed", { userId, period, currency, message });
    return NextResponse.json({ error: `Checkout could not be started: ${message}` }, { status: 502 });
  }
}
