"use client";

const BENEFITS = [
  "Filter by member, ticker, trade type, owner, size, market cap, and filing date",
  "Save a search and get emailed the moment a new trade matches it",
  "Browse without ads",
];

export function UpgradeModal({
  open,
  onClose,
  onContinue,
  onSignIn,
}: {
  open: boolean;
  onClose: () => void;
  onContinue: () => void;
  onSignIn: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-modal-title"
        className="w-full max-w-sm rounded-xl border border-line bg-panel p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="upgrade-modal-title" className="text-lg font-bold tracking-tight text-ink">
          Unlock CongTrade Pro
        </h2>
        <p className="mt-1 text-sm text-ink-muted">Join 4,500+ people already using CongTrade Pro.</p>

        <ul className="mt-4 space-y-2.5">
          {BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2.5 text-sm text-ink">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mt-0.5 shrink-0 text-accent"
                aria-hidden
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
              <span>{benefit}</span>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onContinue}
          className="mt-5 w-full rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Get started
        </button>
        <p className="mt-3 text-center text-xs text-ink-faint">
          Already a member?{" "}
          <button type="button" onClick={onSignIn} className="text-ink-muted underline decoration-line-strong hover:text-ink hover:decoration-ink-muted">
            Sign in
          </button>
        </p>
        <button type="button" onClick={onClose} className="mt-2 w-full py-1 text-xs text-ink-faint hover:text-ink-muted">
          Maybe later
        </button>
      </div>
    </div>
  );
}
