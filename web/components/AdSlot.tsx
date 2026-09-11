"use client";

import { useEffect, useRef } from "react";
import { useAuth, useUser } from "@clerk/nextjs";

// The account-level adsbygoogle.js script (no slot, just the client ID) is
// loaded site-wide in app/layout.tsx, not here — Google needs it present on
// every page to verify site ownership, not just wherever an ad happens to
// render. This component only adds the <ins> unit for one placement and
// asks the already-loaded script to fill it.
//
// Both env vars are unset until AdSense approves congtrade.com and an ad
// unit exists — until then this renders a plain placeholder instead of
// asking for a slot that doesn't exist yet. NEXT_PUBLIC_ADSENSE_SLOT_ID is
// the default/fallback slot; pass `slot` to give a specific placement (e.g.
// the one above the stats bar vs. the one below the results table) its own
// ad unit once you've created more than one in AdSense — Google generally
// expects distinct ad units per placement, not the same one reused twice.
const AD_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
const DEFAULT_AD_SLOT = process.env.NEXT_PUBLIC_ADSENSE_SLOT_ID;

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export function AdSlot({ slot }: { slot?: string } = {}) {
  const adSlot = slot ?? DEFAULT_AD_SLOT;
  const { isLoaded, has } = useAuth();
  const { user } = useUser();
  const isAdmin = (user?.publicMetadata as { admin?: boolean } | undefined)?.admin === true;
  // Same UX-nicety default as the filter gate: don't flash the ad in for a
  // pro user during the brief moment auth is still loading.
  const noAds = isLoaded && (has({ feature: "no_ads" }) || isAdmin);
  const requested = useRef(false);

  useEffect(() => {
    if (noAds || !AD_CLIENT || !adSlot || requested.current) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      requested.current = true;
    } catch {
      // adsbygoogle script hasn't finished loading yet — harmless, nothing to retry here.
    }
  }, [noAds, adSlot]);

  if (noAds) return null;

  if (!AD_CLIENT || !adSlot) {
    return (
      <div className="mx-auto flex h-24 max-w-4xl items-center justify-center rounded-md border border-dashed border-line bg-panel-muted text-xs text-ink-faint">
        Ad space
      </div>
    );
  }

  return (
    // data-ad-format="auto" lets Google pick ANY shape for the reserved
    // space, including a tall square — confirmed live (data-ad-status
    // "unfilled", the normal state for a brand-new ad unit still building
    // traffic/reputation) reserving 412×412 despite a narrower container,
    // since Google sets its own inline width/height once the script runs
    // rather than just filling ours. "horizontal" biases it toward a short,
    // wide banner shape instead, which fits this placement (above/below a
    // wide data table) far better.
    <div className="mx-auto max-w-4xl">
      <ins
        className="adsbygoogle block"
        style={{ display: "block" }}
        data-ad-client={AD_CLIENT}
        data-ad-slot={adSlot}
        data-ad-format="horizontal"
        data-full-width-responsive="true"
      />
    </div>
  );
}
