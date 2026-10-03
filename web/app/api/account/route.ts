import { NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { hasProServer } from "@/lib/access";
import { sql } from "@/lib/db";
import { getSubscriptions } from "@/lib/subscription";
import { PAYING_STATUSES, type SubscriptionProvider, type SubscriptionRow } from "@/lib/subscriptionAccess";

/**
 * The signed-in account, as the app needs to see it.
 *
 * GET is the app's paywall gate: whether this person holds CongTrade Pro, from
 * any source (Stripe, the App Store, Google Play or a comped admin flag). The
 * app never decides that for itself, so a subscription bought on the website
 * opens the app and an admin account used for store review is let straight in.
 *
 * `renewing` lists the providers that will charge again, so the deletion
 * screen can say which subscription has to be cancelled and where.
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const [pro, rows] = await Promise.all([hasProServer(), getSubscriptions(userId)]);
  return NextResponse.json({ pro, renewing: renewingProviders(rows) });
}

/**
 * Deletes the account, as the App Store requires an app to offer in-app.
 *
 * What goes: every alert with its sending history (alert_matches cascades),
 * the cached entitlement, the identifier that links store purchases to the
 * account, and the Clerk user itself. What stays: the subscriptions rows, which
 * are billing records Dutch tax law has us keep for seven years. This is the
 * same list the /delete-account page promises, and the two must agree.
 *
 * Our data goes before the Clerk user. If Clerk then fails, the person still
 * has an account and can simply try again; the other order could leave alerts
 * behind addressed to someone who no longer has an account to delete them from.
 *
 * A website subscription that will renew blocks deletion. Once the account is
 * gone nobody could sign in to cancel it, and it would go on charging a card
 * for access nobody can use. Store subscriptions cannot be cancelled by us at
 * all, which the app says before anyone gets this far.
 */
export async function DELETE() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const renewing = renewingProviders(await getSubscriptions(userId));
  if (renewing.includes("stripe")) {
    return NextResponse.json(
      {
        error:
          "You have a website subscription that will renew. Cancel it on congtrade.com/account first, then delete your account.",
        code: "stripe_renewing",
      },
      { status: 409 }
    );
  }

  await sql.query(`DELETE FROM alerts WHERE user_id = $1`, [userId]);
  await sql.query(`DELETE FROM push_devices WHERE user_id = $1`, [userId]);
  await sql.query(`DELETE FROM user_entitlements WHERE user_id = $1`, [userId]);
  await sql.query(`DELETE FROM store_account_tokens WHERE clerk_user_id = $1`, [userId]);

  try {
    const client = await clerkClient();
    await client.users.deleteUser(userId);
  } catch (err) {
    console.error(`account deletion: Clerk refused to delete ${userId} — ${(err as Error).message}`);
    return NextResponse.json({ error: "Could not delete the account. Please try again." }, { status: 502 });
  }

  return NextResponse.json({ deleted: true });
}

/** Providers that will charge again: paying, and not set to end at the period's close. */
function renewingProviders(rows: readonly SubscriptionRow[]): SubscriptionProvider[] {
  return rows.filter((row) => PAYING_STATUSES.has(row.status) && !row.cancel_at_period_end).map((row) => row.provider);
}
