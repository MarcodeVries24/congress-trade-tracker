import { randomUUID } from "node:crypto";
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
