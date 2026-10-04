import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { clerkClient } from "@clerk/nextjs/server";
import { stripe } from "@/lib/stripe";
import { sendPurchaseConfirmation } from "@/lib/purchaseEmail";
import { claimEvent, upsertSubscription, userIdForCustomer } from "@/lib/subscriptionWrite";

/**
 * Stripe's side of the truth arriving.
 *
 * Signature-verified, because this endpoint decides who has access and has to
 * be reachable without a session: anything that could POST here could
 * otherwise grant itself a subscription.
 *
 * Every handler is written to be applied twice safely. Stripe retries for up
 * to three days and makes no promise about order, so "apply the event, write
 * the row it describes" is the only shape that survives a redelivery from
 * yesterday landing after today's.
 */
const SIGNING_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

/**
 * The events that can change whether someone may use paid features.
 *
 * paused and resumed are here because grantsAccess() treats 'paused' as no
 * access: without them a paused subscription would keep working until some
 * unrelated update happened to arrive. They need no handler of their own —
 * both carry the subscription, and the row is written from whatever it says.
 *
 * Deliberately absent: invoice.payment_failed, which reaches us anyway as an
 * update to 'past_due', and trial_will_end, which changes nothing.
 */
const HANDLED = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
]);

export async function POST(req: NextRequest) {
  if (!SIGNING_SECRET) {
    console.error("STRIPE_WEBHOOK_SECRET is not set; refusing the webhook.");
    return new NextResponse("Not configured", { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new NextResponse("No signature", { status: 400 });

  let event: Stripe.Event;
  try {
    // The raw body, not the parsed one: the signature covers the bytes.
    event = stripe().webhooks.constructEvent(await req.text(), signature, SIGNING_SECRET);
  } catch (err) {
    console.error(`stripe webhook: bad signature — ${(err as Error).message}`);
    return new NextResponse("Invalid signature", { status: 400 });
  }

  if (!HANDLED.has(event.type)) return NextResponse.json({ ok: true, ignored: event.type });

  // First delivery wins; a redelivery of the same event is acknowledged and
  // dropped. The insert is the lock, so two concurrent copies can't both pass.
  if (!(await claimEvent(event.id, event.type))) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    await apply(event);
  } catch (err) {
    // A 500 makes Stripe retry, which is what we want: the row not being
    // written means somebody paid and can't use what they paid for.
    console.error(`stripe webhook: ${event.type} (${event.id}) failed — ${(err as Error).message}`);
    return new NextResponse("Retry", { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

async function apply(event: Stripe.Event): Promise<void> {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (session.mode !== "subscription" || !session.subscription) return;
    const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
    const clerkUserId =
      session.client_reference_id ?? (session.metadata?.clerk_user_id as string | undefined) ?? null;
    const subscription = await stripe().subscriptions.retrieve(subscriptionId);
    await record(subscription, clerkUserId);
    await confirmByEmail(session, subscription);
    return;
  }

  // Every other handled event carries the subscription itself. 'deleted'
  // arrives with status 'canceled' and 'paused' with status 'paused', so none
  // of them needs a special case: the row is written with whatever status
  // came, and grantsAccess() decides what it means.
  await record(event.data.object as Stripe.Subscription, null);
}

async function record(subscription: Stripe.Subscription, fallbackUserId: string | null): Promise<void> {
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  // The id is stamped on the subscription at checkout. The customer lookup is
  // the fallback for anything created by hand in the Stripe dashboard.
  const clerkUserId =
    (subscription.metadata?.clerk_user_id as string | undefined) ??
    fallbackUserId ??
    (await userIdForCustomer(customerId));

  if (!clerkUserId) {
    // Not an error worth retrying: a subscription with no CongTrade user
    // behind it is somebody's test object, and retrying won't conjure one.
    console.error(`stripe webhook: subscription ${subscription.id} has no clerk user; skipped`);
    return;
  }

  const item = subscription.items.data[0];
  // Newer API versions moved the period to the item; older ones keep it on
  // the subscription. Read whichever is present rather than pinning a version.
  const periodEnd =
    (item as { current_period_end?: number } | undefined)?.current_period_end ??
    (subscription as unknown as { current_period_end?: number }).current_period_end ??
    null;

  await upsertSubscription({
    clerkUserId,
    provider: "stripe",
    providerAccountId: customerId,
    providerSubscriptionId: subscription.id,
    status: subscription.status,
    productId: item?.price?.id ?? null,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
  });

  // A mirror for the browser. The table stays the enforcement boundary; this
  // only exists so the trades page can grey out a filter without waiting on a
  // round trip, and so it can't be trusted for anything that matters.
  try {
    const client = await clerkClient();
    await client.users.updateUserMetadata(clerkUserId, {
      publicMetadata: { pro: ["active", "trialing", "past_due"].includes(subscription.status) },
    });
  } catch (err) {
    console.error(`stripe webhook: could not mirror plan onto ${clerkUserId} — ${(err as Error).message}`);
  }
}

/**
 * The purchase confirmation email (lib/purchaseEmail.ts). Best effort: the
 * subscription is already recorded, and a failed email must not make Stripe
 * retry the whole event.
 */
async function confirmByEmail(session: Stripe.Checkout.Session, subscription: Stripe.Subscription): Promise<void> {
  const to = session.customer_details?.email ?? session.customer_email;
  if (!to) return;
  try {
    const item = subscription.items.data[0];
    const price = item?.price;
    const interval = price?.recurring?.interval;
    const amount =
      price?.unit_amount != null
        ? `${new Intl.NumberFormat("en-US", { style: "currency", currency: (price.currency ?? "eur").toUpperCase() }).format(price.unit_amount / 100)} a ${interval ?? "period"}`
        : "as shown at checkout";
    const periodEnd =
      (item as { current_period_end?: number } | undefined)?.current_period_end ??
      (subscription as unknown as { current_period_end?: number }).current_period_end ??
      null;
    await sendPurchaseConfirmation({
      to,
      plan: interval === "year" ? "CongTrade Pro, yearly" : interval === "month" ? "CongTrade Pro, monthly" : "CongTrade Pro",
      amount,
      renews: periodEnd ? new Date(periodEnd * 1000) : null,
      startNowRequestedAt: (subscription.metadata?.start_now_requested_at as string | undefined) ?? null,
    });
  } catch (err) {
    console.error(`stripe webhook: purchase confirmation to ${to} failed — ${(err as Error).message}`);
  }
}
