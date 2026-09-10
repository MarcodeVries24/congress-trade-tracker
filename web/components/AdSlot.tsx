"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";
import { useAuth, useUser } from "@clerk/nextjs";

// Both unset until AdSense approves congtrade.com and an ad unit exists —
// until then this renders a plain placeholder instead of asking the
// AdSense script to fill a slot that doesn't exist yet.
const AD_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
const AD_SLOT = process.env.NEXT_PUBLIC_ADSENSE_SLOT_ID;

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

export function AdSlot() {
  const { isLoaded, has } = useAuth();
  const { user } = useUser();
  const isAdmin = (user?.publicMetadata as { admin?: boolean } | undefined)?.admin === true;
  // Same UX-nicety default as the filter gate: don't flash the ad in for a
  // pro user during the brief moment auth is still loading.
  const noAds = isLoaded && (has({ feature: "no_ads" }) || isAdmin);
  const requested = useRef(false);

  useEffect(() => {
    if (noAds || !AD_CLIENT || !AD_SLOT || requested.current) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      requested.current = true;
    } catch {
      // adsbygoogle script hasn't finished loading yet — harmless, nothing to retry here.
    }
  }, [noAds]);

  if (noAds) return null;

  if (!AD_CLIENT || !AD_SLOT) {
    return (
      <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-line bg-panel-muted text-xs text-ink-faint">
        Ad space
      </div>
    );
  }

  return (
    <>
      <Script async src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${AD_CLIENT}`} crossOrigin="anonymous" strategy="afterInteractive" />
      <ins
        className="adsbygoogle block"
        style={{ display: "block" }}
        data-ad-client={AD_CLIENT}
        data-ad-slot={AD_SLOT}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </>
  );
}
