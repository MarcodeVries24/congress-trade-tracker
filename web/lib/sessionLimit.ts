import { clerkClient } from "@clerk/nextjs/server";

import { isProSubscription, type BillingItems } from "./proPlan";

/**
 * The slice of Clerk's backend client this module touches.
 *
 * Named so the logic below can be exercised against a stand-in: the real
 * client needs a live instance, a paid subscription and four signed-in
 * browsers to reach the interesting branch, and none of that is something a
 * test can arrange.
 */
export type SessionLimitClient = {
  users: { getUser(userId: string): Promise<{ publicMetadata: unknown }> };
  billing: { getUserBillingSubscription(userId: string): Promise<BillingItems> };
  sessions: {
    getSessionList(params: {
      userId: string;
      status: "active";
      limit: number;
    }): Promise<{ data: readonly { id: string; lastActiveAt: number; createdAt: number }[] }>;
    revokeSession(sessionId: string): Promise<unknown>;
  };
};

/**
 * How many browsers one account may stay signed in on at once.
 *
 * Clerk has no setting for this — its session options cover lifetime and
 * multi-account browsers, not a concurrency cap — so it is enforced here, on
 * the session.created webhook. It applies to paying accounts only: the point
 * is that one subscription isn't shared around, not that anyone is rationed.
 *
 * Worth being precise about what it counts: a Clerk session is a *browser*,
 * not a device. Chrome and Safari on one laptop are two, and clearing cookies
 * starts a third. Three is generous for one person and tight for a shared
 * password, which is the point.
 */
export const MAX_CONCURRENT_SESSIONS = 3;

/**
 * Whether this account is a paying one, asked of Clerk directly.
 *
 * lib/access.ts answers the same question from a request context; a webhook
 * has none, so it goes through the Backend API the way the alert sender does.
 *
 * Throws if Clerk can't answer, rather than guessing. The caller turns that
 * into a 500 so Clerk retries — nothing is revoked in the meantime, because
 * the cost of guessing wrong is signing a real customer out of their own
 * laptop.
 */
async function isPayingAccount(client: SessionLimitClient, userId: string): Promise<boolean> {
  // A comped operator account ({"admin": true} in public metadata) is exempt
  // rather than capped: it's the owner's own account, not a shared login.
  try {
    const user = await client.users.getUser(userId);
    if ((user.publicMetadata as { admin?: boolean } | undefined)?.admin === true) return false;
  } catch (err) {
    // A user who no longer exists has nothing to enforce, and retrying that
    // forever would just be noise. Any other failure is worth a retry.
    if ((err as { status?: number }).status === 404) return false;
    throw err;
  }

  try {
    return isProSubscription(await client.billing.getUserBillingSubscription(userId));
  } catch (err) {
    // An account with no subscription record at all is a 404, which means
    // free, not broken. Anything else is a real failure and worth a retry.
    if ((err as { status?: number }).status === 404) return false;
    throw err;
  }
}

/**
 * Signs the user out of their least recently used browsers until only
 * MAX_CONCURRENT_SESSIONS remain.
 *
 * Revoking the stalest rather than refusing the newest is deliberate: someone
 * signing in on a new laptop should get in, and lose the phone they last used
 * three weeks ago. The alternative locks a person out of the device in front
 * of them, which reads as a broken login rather than a policy.
 *
 * Stale means last used, not first signed in. Sorting on sign-in date would
 * revoke the browser someone opens every morning but signed into a year ago,
 * ahead of one they signed into last week and abandoned — wrong for a real
 * person, and a weaker signal for a shared password, where it's the idle
 * logins that are the giveaway.
 */
export async function enforceSessionLimit(
  userId: string,
  injected?: SessionLimitClient
): Promise<string[]> {
  const client: SessionLimitClient = injected ?? (await clerkClient());

  // The cap exists to stop one paid login being shared, so it only applies to
  // paid logins. A free account signing in on six browsers costs nothing and
  // gains nothing by being cut off; capping it would just be a worse free
  // tier for no reason.
  if (!(await isPayingAccount(client, userId))) return [];

  const { data: sessions } = await client.sessions.getSessionList({
    userId,
    status: "active",
    limit: 100,
  });
  if (sessions.length <= MAX_CONCURRENT_SESSIONS) return [];

  // Most recently used first, so the ones past the limit are the stalest.
  // Sign-in date only breaks a tie, which keeps the pick deterministic.
  const stale = [...sessions]
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt || b.createdAt - a.createdAt)
    .slice(MAX_CONCURRENT_SESSIONS);

  const revoked: string[] = [];
  for (const session of stale) {
    try {
      await client.sessions.revokeSession(session.id);
      revoked.push(session.id);
    } catch (err) {
      // One failure shouldn't strand the rest — the next sign-in retries.
      console.error(`session limit: could not revoke ${session.id}: ${(err as Error).message}`);
    }
  }
  return revoked;
}
