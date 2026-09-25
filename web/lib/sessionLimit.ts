import { clerkClient } from "@clerk/nextjs/server";

/**
 * How many browsers one account may stay signed in on at once.
 *
 * Clerk has no setting for this — its session options cover lifetime and
 * multi-account browsers, not a concurrency cap — so it is enforced here, on
 * the session.created webhook.
 *
 * Worth being precise about what it counts: a Clerk session is a *browser*,
 * not a device. Chrome and Safari on one laptop are two, and clearing cookies
 * starts a third. Three is generous for one person and tight for a shared
 * password, which is the point.
 */
export const MAX_CONCURRENT_SESSIONS = 3;

/**
 * Signs the user out of their oldest browsers until only the newest
 * MAX_CONCURRENT_SESSIONS remain.
 *
 * Revoking the oldest rather than refusing the newest is deliberate: someone
 * signing in on a new laptop should get in, and lose the phone they last used
 * three weeks ago. The alternative locks a person out of the device in front
 * of them, which reads as a broken login rather than a policy.
 */
export async function enforceSessionLimit(userId: string): Promise<string[]> {
  const client = await clerkClient();
  const { data: sessions } = await client.sessions.getSessionList({
    userId,
    status: "active",
    limit: 100,
  });
  if (sessions.length <= MAX_CONCURRENT_SESSIONS) return [];

  // Newest first, so the ones past the limit are the stalest.
  const stale = [...sessions]
    .sort((a, b) => b.createdAt - a.createdAt)
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
