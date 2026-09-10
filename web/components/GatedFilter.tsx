import type { ReactNode } from "react";

// Wraps a filter control (or a small group of them, e.g. the date-range
// inputs) that requires the paid plan. Deliberately doesn't touch
// Select/MultiSelect/SearchableMultiSelect — `className` (sizing, and for
// the date-range group its own flex layout) always lands on the div that
// directly wraps the real children, in both branches below, so the group
// still lays out identically whether locked or not; only an unstyled
// `relative` div is added around that for the lock overlay to position
// against. When locked, the real control is dimmed and inert
// (`pointer-events-none`) and a button sits on top intercepting the click —
// with an opaque patch behind the lock glyph so it replaces the control's
// own chevron instead of just overlapping it.
export function GatedFilter({
  locked,
  onLockedClick,
  className = "",
  children,
}: {
  locked: boolean;
  onLockedClick?: () => void;
  className?: string;
  children: ReactNode;
}) {
  if (!locked) return <div className={className}>{children}</div>;

  return (
    <div className="relative">
      <div className={`pointer-events-none opacity-50 ${className}`}>{children}</div>
      <button
        type="button"
        onClick={onLockedClick}
        aria-label="Sign up for CongTrade Pro to use this filter"
        title="CongTrade Pro feature"
        className="absolute inset-0 cursor-pointer rounded-md"
      >
        <span className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-sm bg-panel">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-faint" aria-hidden>
            <rect x="4" y="11" width="16" height="9" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </span>
      </button>
    </div>
  );
}
