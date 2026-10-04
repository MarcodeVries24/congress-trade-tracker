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
  annualTotal,
}: {
  monthly: string;
  annualMonthly: string;
  /** What a yearly plan actually charges, for the renewal notice. */
  annualTotal: string;
  /** Currency is decided server-side from the visitor's country. */
  symbol: string;
  savingPercent: number | null;
  returnTo?: string;
}) {
  const [annual, setAnnual] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The EU's 14-day withdrawal right: starting a service inside it needs the
  // consumer's express request, and a sentence in the terms isn't one. This
  // tick box is; the server refuses checkout without it and records when.
  const [startNow, setStartNow] = useState(false);
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
    if (!startNow) {
      setError("Tick the box above the button to continue.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ period: annual ? "annual" : "monthly", returnTo, startNow: true }),
      });
      // Parsed by hand rather than with res.json(): a route that crashes
      // answers with an HTML error page, and letting that throw here reported
      // every server-side failure as "could not reach", which sent us looking
      // at the network when the request had arrived and been answered.
      const body = await res.text();
      let data: { url?: string; error?: string } = {};
      try {
        data = JSON.parse(body) as { url?: string; error?: string };
      } catch {
        data = {};
      }
      if (data.url) window.location.href = data.url;
      else setError(data.error ?? `Could not start checkout (error ${res.status}). Please try again.`);
    } catch {
      setError("Could not reach the payment page. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const price = annual ? annualMonthly : monthly;

  return (
    <div>
      {/* One control for both cards. It sits above them because the price
          shown inside the Pro card is what it changes, and a switch placed
          after the number it rewrites reads as an afterthought. */}
      <div className="mb-4 flex justify-center">
        <div role="group" aria-label="Billing period" className="inline-flex rounded-lg border border-line bg-panel p-1">
          {([
            { value: false, label: "Monthly" },
            { value: true, label: "Yearly" },
          ] as const).map((option) => {
            const selected = annual === option.value;
            return (
              <button
                key={option.label}
                type="button"
                aria-pressed={selected}
                onClick={() => setAnnual(option.value)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  selected ? "bg-accent text-white" : "text-ink-muted hover:text-ink"
                }`}
              >
                {option.label}
                {option.value && savingPercent ? (
                  <span className={`ml-1.5 text-xs font-semibold ${selected ? "text-white/80" : "text-accent"}`}>
                    &minus;{savingPercent}%
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

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
            <>
              <label className="mt-5 flex cursor-pointer items-start gap-2 text-xs leading-relaxed text-ink-muted">
                <input
                  type="checkbox"
                  checked={startNow}
                  onChange={(e) => setStartNow(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--accent))]"
                />
                <span>
                  Start Pro straight away. I understand that if I withdraw within 14 days, I pay for the days I&apos;ve
                  already used, and get the rest back.
                </span>
              </label>
              <button
                type="button"
                onClick={subscribe}
                disabled={busy || !startNow}
                className="mt-3 w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {busy ? "Opening checkout…" : "Subscribe"}
              </button>
              {/* Auto-renewal notice, next to the button, as US state auto-renewal laws ask. */}
              <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
                {symbol}
                {annual ? `${annualTotal} a year` : `${monthly} a month`}, renews automatically until you cancel. Cancel any
                time from your account; you keep Pro until the end of the period you paid for. By subscribing you agree to
                the{" "}
                <a href="/terms" className="underline decoration-line-strong hover:text-ink">
                  Terms
                </a>{" "}
                and{" "}
                <a href="/privacy" className="underline decoration-line-strong hover:text-ink">
                  Privacy Policy
                </a>
                .
              </p>
            </>
          )}
          {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
        </div>
      </div>
    </div>
  );
}
