import { currentUser } from "@clerk/nextjs/server";

/**
 * Who may approve filings: an account whose Clerk public metadata says
 * `{ "role": "admin" }`. Set by hand in the Clerk dashboard (Users → the
 * account → Metadata → Public), on each Clerk instance. Public metadata can
 * only be written from the dashboard or the backend API, never by the user's
 * own browser, which is what makes it safe to trust here.
 *
 * Returns the admin's Clerk user id, or null for anyone else (signed out
 * included), so callers can record who approved what.
 */
export async function adminUserId(): Promise<string | null> {
  const user = await currentUser();
  if (!user) return null;
  return (user.publicMetadata as { role?: unknown } | undefined)?.role === "admin" ? user.id : null;
}
