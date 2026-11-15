import { randomUUID } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";
import { sql } from "@/lib/db";

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
 * Who holds an App Store subscription now, by its original transaction id.
 * Usually the account whose token is in the purchase; after a subscription
 * has moved from a deleted account, the one it moved to, which the token
 * (fixed in the purchase forever) no longer says.
 */
export async function appleSubscriptionHolder(originalTransactionId: string): Promise<string | null> {
  const rows = (await sql.query(
    `SELECT clerk_user_id FROM subscriptions WHERE provider = 'apple' AND provider_account_id = $1
     ORDER BY updated_at DESC LIMIT 1`,
    [originalTransactionId]
  )) as { clerk_user_id: string }[];
  return rows[0]?.clerk_user_id ?? null;
}

/** Drops a subscription's rows held by anyone but `keep`, when it moves to `keep`. */
export async function releaseAppleSubscription(originalTransactionId: string, keep: string): Promise<void> {
  await sql.query(
    `DELETE FROM subscriptions WHERE provider = 'apple' AND provider_account_id = $1 AND clerk_user_id <> $2`,
    [originalTransactionId, keep]
  );
}
