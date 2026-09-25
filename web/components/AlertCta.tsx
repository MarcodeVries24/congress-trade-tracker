"use client";

import Link from "next/link";
import { AlertFilters, describeAlert } from "@/lib/alertFilters";
import { alertDraftHref } from "@/lib/alertsClient";

function BellIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="shrink-0">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

/**
 * A one-line offer directly under the filters: turn the search you just built
 * into an email alert.
 *
 * It sits here rather than on a pricing page because this is the moment the
 * intent exists — someone who has just narrowed to "House purchases over
 * $50,001" has demonstrably said what they want to be told about. Asking then
 * costs them one click, and the filters carry over, so they never rebuild it.
 *
 * Deliberately one row. It sits between the filters and the results, where
 * anything taller would push the data the visitor actually came for below the
 * fold.
 */
export function AlertCta({
  filters,
  locked,
  signedIn,
  onLockedClick,
}: {
  filters: AlertFilters;
  /** True when the visitor can't use alerts yet — signed out, or signed in without Pro. */
  locked: boolean;
  signedIn: boolean;
  onLockedClick: () => void;
}) {
  const chips = describeAlert(filters);
  const isEverything = chips.length === 1 && chips[0] === "Every new trade";

  // The criteria read back to them, so the offer is concrete rather than
  // generic — "emailed when a House purchase over $50,001 is filed" is a much
  // clearer proposition than "get email alerts".
  const summary = isEverything
    ? "any new trade is filed"
    : `a new trade matches ${chips.slice(0, 3).join(" · ")}${chips.length > 3 ? " …" : ""}`;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line bg-panel px-4 py-2.5 sm:mb-6">
      <span className="text-accent">
        <BellIcon />
      </span>
      <p className="min-w-0 flex-1 text-xs text-ink-muted sm:text-sm">
        <span className="text-ink">Get an email</span> when {summary}.
      </p>
      {locked ? (
        <button
          type="button"
          onClick={onLockedClick}
          className="shrink-0 whitespace-nowrap rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          {signedIn ? "Unlock with Pro" : "Get alerts"}
        </button>
      ) : (
        <Link
          href={alertDraftHref(filters)}
          className="shrink-0 whitespace-nowrap rounded-full bg-accent px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
        >
          Create alert
        </Link>
      )}
    </div>
  );
}
