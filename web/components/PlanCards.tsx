"use client";

import { useState } from "react";
import { useAuth, useClerk } from "@clerk/nextjs";
import { useProMirror } from "@/lib/useProMirror";

/**
 * The pricing cards, and the button that opens Stripe Checkout.
 *
 * Ours rather than a provider's widget, which is the point of the move: the
 * payment methods a buyer is offered — card, iDEAL, SEPA Direct Debit,
 * Bancontact, Apple Pay — are chosen in the Stripe dashboard and appear on
 * the hosted checkout page without anything changing here.
 */
const FREE_FEATURES = [
  "Every disclosed trade, free to read",
  "Full member and issuer pages",
  "Search the whole archive",
];

const PRO_FEATURES = [
  "Filter by member, ticker, size, market cap, date",
  "Save a search, get an email when it matches",
  "No ads, on every page",
];

function Tick() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
      strokeLinecap="round" strokeLinejoin="round" className="mt-[3px] shrink-0 text-accent" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function PlanCards({
  monthly,
  annualMonthly,
  symbol,
  savingPercent,
  returnTo,
}: {
  monthly: string;
  annualMonthly: string;
  /** Currency is decided server-side from the visitor's country. */
  symbol: string;
  savingPercent: number | null;
  returnTo?: string;
}) {
  const [annual, setAnnual] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isSignedIn } = useAuth();
  const { openSignUp } = useClerk();
  const { isPro } = useProMirror();

  async function subscribe() {
    setError(null);
    if (!isSignedIn) {
      // An account has to exist before it can own a subscription, and coming
      // back here afterwards is better than dropping them on the home page.
      openSignUp({ forceRedirectUrl: "/upgrade", signInForceRedirectUrl: "/upgrade" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ period: annual ? "annual" : "monthly", returnTo }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) window.location.href = data.url;
      else setError(data.error ?? "Could not start checkout. Please try again.");
    } catch {
      setError("Could not reach the payment page. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const price = annual ? annualMonthly : monthly;

  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-panel p-5">
          <h3 className="text-sm font-semibold text-ink">Free</h3>
          <p className="mt-2 text-2xl font-bold tracking-tight text-ink">{symbol}0</p>
          <p className="mt-0.5 text-xs text-ink-faint">Always free, no account needed</p>
          <ul className="mt-4 space-y-2 text-sm text-ink-muted">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex gap-2">
                <Tick />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-accent/40 bg-panel p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold text-ink">CongTrade Pro</h3>
            {isPro && <span className="text-[11px] font-medium text-accent">Current plan</span>}
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-ink">
            {symbol}
            {price}
            <span className="text-sm font-normal text-ink-faint"> /month</span>
          </p>
          <p className="mt-0.5 text-xs text-ink-faint">
            {annual ? "Billed annually" : "Billed monthly"}
            {annual && savingPercent ? `, saving ${savingPercent}%` : ""}
          </p>

          <button
            type="button"
            onClick={() => setAnnual((v) => !v)}
            className="mt-3 text-xs text-accent underline decoration-line-strong hover:decoration-current"
          >
            {annual ? "Switch to monthly billing" : "Switch to annual billing"}
          </button>

          <ul className="mt-4 space-y-2 text-sm text-ink-muted">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex gap-2">
                <Tick />
                <span>{f}</span>
              </li>
            ))}
          </ul>

          {isPro ? (
            <p className="mt-5 text-sm text-ink-muted">
              You&apos;re on Pro. Manage or cancel it from your{" "}
              <a href="/account" className="text-accent underline decoration-line-strong hover:decoration-current">
                account
              </a>
              .
            </p>
          ) : (
            <button
              type="button"
              onClick={subscribe}
              disabled={busy}
              className="mt-5 w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Opening checkout…" : "Subscribe"}
            </button>
          )}
          {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        </div>
      </div>
    </div>
  );
}
