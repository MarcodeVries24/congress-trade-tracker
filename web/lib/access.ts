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

// Every feature slug that means "this account has CongTrade Pro".
//
// These are the real slugs on the `pro_congtrade` plan in Clerk Billing,
// which grants `notifications`, `filters` and `no_ads` together. Both are
// listed rather than just one so that a future plan split (an alerts-only
// tier, say) doesn't silently lock anyone out — holding either grants Pro.
//
// Must stay in step with PRO_FEATURE_SLUGS in ingest/src/alerts/entitlements.ts,
// which asks Clerk the same question from outside a request context.
const PRO_FEATURES = ["notifications", "filters"];

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
