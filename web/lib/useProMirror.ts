"use client";

import { useAuth, useUser } from "@clerk/nextjs";

/**
 * Whether the browser should draw paid features as unlocked.
 *
 * A mirror, not the boundary. The Stripe webhook copies the plan onto the
 * Clerk user's public metadata so a page can answer this without a round trip;
 * the real check happens server-side in lib/access.ts against the
 * subscriptions table, and every gated API route makes it.
 *
 * Defaults to unlocked while Clerk is still loading, which is the same
 * nicety the filter gate always had: better a half-second of open filters
 * than a flash of locked ones for someone who pays.
 */
export function useProMirror(): { loaded: boolean; isPro: boolean } {
  const { isLoaded } = useAuth();
  const { user } = useUser();
  const metadata = user?.publicMetadata as { pro?: boolean; admin?: boolean } | undefined;
  return { loaded: isLoaded, isPro: metadata?.pro === true || metadata?.admin === true };
}
