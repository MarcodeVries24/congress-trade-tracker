"use client";

import { useState } from "react";

/**
 * Opens Stripe's billing portal, where a subscriber changes card, switches
 * between monthly and annual, downloads invoices or cancels.
 *
 * None of that is built here on purpose. "Cancel any time from your account
 * page" is a promise the site makes on the pricing page, and the shortest
 * path to keeping it is to hand the whole job to the provider that already
 * does it properly.
 */
export function ManagePlanButton({ className = "" }: { className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) window.location.href = data.url;
      else setError(data.error ?? "Could not open the billing portal.");
    } catch {
      setError("Could not reach the billing portal.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button type="button" onClick={open} disabled={busy} className={className}>
        {busy ? "Opening…" : "Manage plan"}
      </button>
      {error && <span className="text-xs text-red-500">{error}</span>}
    </span>
  );
}
