import { auth, currentUser } from "@clerk/nextjs/server";

// Comp access, independent of a paid plan — granted by setting
// `{"admin": true}` in a user's *public* metadata (Clerk dashboard: Users ->
// pick user -> Metadata; or via the Backend API), not by assigning them the
// paid plan. Lets an operator (or anyone comped) use paid features without a
// real subscription/Stripe checkout. Checked server-side here since this is
// the actual enforcement boundary — see the matching client-side check in
// app/page.tsx, which is UI-only.
export async function hasFeatureServer(feature: string): Promise<boolean> {
  const { has } = await auth();
  if (has({ feature })) return true;
  const user = await currentUser();
  return (user?.publicMetadata as { admin?: boolean } | undefined)?.admin === true;
}

// Every feature key that means "this account has CongTrade Pro".
//
// "filters" is the key the live plan was configured with; "alerts" is here so
// that if the plan later gains its own alerts feature in the Clerk dashboard,
// accounts holding it are recognized immediately — and, crucially, so that
// *not* adding it doesn't lock today's paying subscribers out of the alerts
// screen. Either one grants Pro.
const PRO_FEATURES = ["filters", "alerts"];

/**
 * Whether the caller may use paid features. Same comp-access escape hatch as
 * hasFeatureServer (public metadata {"admin": true}).
 */
export async function hasProServer(): Promise<boolean> {
  const { has } = await auth();
  if (PRO_FEATURES.some((feature) => has({ feature }))) return true;
  const user = await currentUser();
  return (user?.publicMetadata as { admin?: boolean } | undefined)?.admin === true;
}
