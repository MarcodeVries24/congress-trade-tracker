import { randomUUID } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { appleOwner } from "@/lib/appleOwner";
import { sql } from "@/lib/db";
import type { SubscriptionRow } from "@/lib/subscriptionAccess";

/**
 * The UUID that ties a store purchase back to a CongTrade account.
 *
 * Apple's appAccountToken is a UUID, not a free string: StoreKit parses it with
 * UUID(uuidString:) and drops anything that is not one, without complaining. A
 * Clerk id is "user_2abc...", so sending one produces a purchase that verifies
 * perfectly and belongs to nobody. That failure is invisible until someone has
 * paid and has nothing to show for it, which is why this indirection exists
 * rather than the obvious direct approach.
 *
 * One token per account, kept forever. Rotating it would orphan every purchase
 * already carrying the old one, and there is nothing to gain: the token is an
 * opaque identifier, not a credential, and the stores hand it back to us rather
 * than accepting it as proof of anything.
 */
export async function accountTokenFor(clerkUserId: string): Promise<string> {
  const existing = (await sql.query(
    `SELECT token FROM store_account_tokens WHERE clerk_user_id = $1`,
    [clerkUserId]
  )) as { token: string }[];
  if (existing[0]) return existing[0].token;

  const token = randomUUID();
  // ON CONFLICT rather than a check-then-insert: two devices signing in at once
  // would otherwise race and one would get a second token for the same person.
  const inserted = (await sql.query(
    `INSERT INTO store_account_tokens (token, clerk_user_id) VALUES ($1, $2)
     ON CONFLICT (clerk_user_id) DO UPDATE SET clerk_user_id = EXCLUDED.clerk_user_id
     RETURNING token`,
    [token, clerkUserId]
  )) as { token: string }[];
  return inserted[0]?.token ?? token;
}

/** Whose purchase this is, or null if we have never issued that token. */
export async function userForAccountToken(token: string): Promise<string | null> {
  const rows = (await sql.query(
    `SELECT clerk_user_id FROM store_account_tokens WHERE token = $1`,
    [token]
  )) as { clerk_user_id: string }[];
  return rows[0]?.clerk_user_id ?? null;
}

/**
 * Whether a Clerk account still exists. A purchase tied to a deleted one
 * belongs to nobody, and may move to whoever restores it (see the Apple
 * route). Only a definite "not found" counts as gone: any other failure to
 * ask is treated as the account existing, so an outage never hands one
 * person's subscription to someone else.
 */
export async function accountStillExists(clerkUserId: string): Promise<boolean> {
  try {
    await (await clerkClient()).users.getUser(clerkUserId);
    return true;
  } catch (err) {
    return (err as { status?: number }).status !== 404;
  }
}

/**
 * The account an App Store subscription belongs to, or null when nobody holds
 * it and its token names no account. The row by its original transaction id,
 * and the token in the latest purchase, as lib/appleOwner weighs them. A token
 * naming a deleted account says nothing: after a subscription has moved from
 * one, the token (fixed in the purchase) still names it.
 */
export async function appleSubscriptionOwner(
  originalTransactionId: string | null | undefined,
  accountToken: string | null | undefined
): Promise<string | null> {
  const rows = originalTransactionId
    ? ((await sql.query(
        `SELECT clerk_user_id, provider, provider_account_id, provider_subscription_id,
                status, product_id, current_period_end, cancel_at_period_end
         FROM subscriptions WHERE provider = 'apple' AND provider_account_id = $1
         ORDER BY updated_at DESC LIMIT 1`,
        [originalTransactionId]
      )) as SubscriptionRow[])
    : [];
  const holder = rows[0] ?? null;
  let tokenUser = accountToken ? await userForAccountToken(accountToken) : null;
  if (holder && tokenUser && tokenUser !== holder.clerk_user_id && !(await accountStillExists(tokenUser))) {
    tokenUser = null;
  }
  return appleOwner(holder, tokenUser);
}

/** Drops a subscription's rows held by anyone but `keep`, when it moves to `keep`. */
export async function releaseAppleSubscription(originalTransactionId: string, keep: string): Promise<void> {
  await sql.query(
    `DELETE FROM subscriptions WHERE provider = 'apple' AND provider_account_id = $1 AND clerk_user_id <> $2`,
    [originalTransactionId, keep]
  );
}
