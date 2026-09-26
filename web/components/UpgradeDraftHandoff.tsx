"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useUser } from "@clerk/nextjs";
import { AlertFilters, describeAlert } from "@/lib/alertFilters";
import { alertDraftHref, readAlertDraft } from "@/lib/alertsClient";

/**
 * Keeps a half-built alert alive across checkout.
 *
 * Someone who hit the upgrade wall from the trades page arrives here with
 * their filters in the URL. This shows them what they were part-way through,
 * and sends them back to finish it the moment they hold Pro — so paying
 * completes the thing they were doing rather than dumping them on a pricing
 * page with nothing to show for it.
 *
 * Belt and braces on purpose: the redirect fires when Clerk reports the plan,
 * but the button is always there. Clerk refreshes session claims after a
 * checkout on its own schedule, and a funnel step that only works if that
 * lands promptly is a funnel step that sometimes doesn't work.
 */
export function UpgradeDraftHandoff() {
  const router = useRouter();
  const { isLoaded, has } = useAuth();
  const { user } = useUser();
  const [draft, setDraft] = useState<AlertFilters | null>(null);

  useEffect(() => {
    setDraft(readAlertDraft(window.location.search) ?? null);
  }, []);

  const isAdmin = (user?.publicMetadata as { admin?: boolean } | undefined)?.admin === true;
  const isPro = isLoaded && (has({ feature: "notifications" }) || has({ feature: "filters" }) || isAdmin);

  useEffect(() => {
    if (draft && isPro) router.replace(alertDraftHref(draft));
  }, [draft, isPro, router]);

  if (!draft) return null;

  return (
    <div className="mb-6 rounded-lg border border-accent/40 bg-accent/5 px-4 py-3">
      <p className="text-sm text-ink">
        You were setting up an alert for{" "}
        <span className="font-medium">{describeAlert(draft).join(" · ")}</span>.
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        It&apos;s saved in this link, so finish upgrading and we&apos;ll take you straight back to it.
      </p>
      <button
        type="button"
        onClick={() => router.push(alertDraftHref(draft))}
        className="mt-3 rounded-full border border-accent/50 px-3 py-1.5 text-xs font-medium text-accent transition-colors hover:border-accent"
      >
        Continue to my alert
      </button>
    </div>
  );
}
