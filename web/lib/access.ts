import { auth, currentUser } from "@clerk/nextjs/server";
import { isSubscriber } from "@/lib/subscription";

// Comp access, independent of a paid plan — granted by setting
// `{"admin": true}` in a user's *public* metadata (Clerk dashboard: Users ->
// pick user -> Metadata; or via the Backend API), not by a subscription. Lets
// an operator (or anyone comped) use paid features without paying. Unchanged
// by the move off Clerk Billing: this was always Clerk *user* data rather
// than billing data.
async function isComped(): Promise<boolean> {
  const user = await currentUser();
  return (user?.publicMetadata as { admin?: boolean } | undefined)?.admin === true;
}

/**
 * Whether the caller may use paid features.
 *
 * Reads our own subscriptions table, which a Stripe webhook keeps current.
 * Both exported helpers keep the signatures they had under Clerk Billing, so
 * every call site — five API routes and the account page — is untouched by
 * the change of provider. What varies between them is only which feature is
 * being asked about, and today every paid feature comes in one plan.
 *
 * This is the enforcement boundary. The client-side checks in the trades page
 * are UI only, and read a mirror of this on the Clerk user (see the Stripe
 * webhook, which writes both).
 */
export async function hasProServer(): Promise<boolean> {
  const { userId } = await auth();
  if (await isSubscriber(userId)) return true;
  return isComped();
}

/**
 * Per-feature check, kept as its own function because the call sites read
 * better for it ("can this caller use filters?") and because a tiered plan
 * later would want exactly this shape back.
 */
export async function hasFeatureServer(_feature: string): Promise<boolean> {
  return hasProServer();
}
