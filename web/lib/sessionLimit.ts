import { clerkClient } from "@clerk/nextjs/server";

import { isSubscriber } from "./subscription";

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
 * Whether this account is a paying one.
 *
 * Reads the subscriptions table, the same source lib/access.ts uses for the
 * request-time checks, so a webhook and a page agree by construction. It also
 * removes the call this used to make to a billing API on every sign-in, which
 * was the fragile part: a beta endpoint, a 404 that meant "free" rather than
 * "broken", and a retry policy built around both.
 *
 * Throws only if the database is unreachable. The caller turns that into a
 * 500 so Clerk retries, and nothing is revoked in the meantime — the cost of
 * guessing wrong is signing a real customer out of their own laptop.
 */
async function isPayingAccount(
  client: SessionLimitClient,
  userId: string,
  hasSubscription: (userId: string) => Promise<boolean>
): Promise<boolean> {
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

  return hasSubscription(userId);
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
export type SessionLimitDeps = {
  client?: SessionLimitClient;
  /**
   * The table read, and only the table read. The comp-account check and the
   * deleted-user handling stay in isPayingAccount below, where they are the
   * behaviour under test rather than something a fake re-implements.
   */
  hasSubscription?: (userId: string) => Promise<boolean>;
};

export async function enforceSessionLimit(userId: string, deps: SessionLimitDeps = {}): Promise<string[]> {
  const client: SessionLimitClient = deps.client ?? (await clerkClient());

  // The cap exists to stop one paid login being shared, so it only applies to
  // paid logins. A free account signing in on six browsers costs nothing and
  // gains nothing by being cut off; capping it would just be a worse free
  // tier for no reason.
  if (!(await isPayingAccount(client, userId, deps.hasSubscription ?? isSubscriber))) return [];

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
