import type { ReactNode } from "react";

// Wraps a filter control (or a small group of them, e.g. the date-range
// inputs) that requires the paid plan. Deliberately doesn't touch
// Select/MultiSelect/SearchableMultiSelect — moving `className` (sizing)
// from the wrapped control onto this wrapper's own div, and leaving the
// control's own className empty, means the control still fills its parent
// exactly as before (a block element with no width naturally fills its
// container), whether locked or not. When locked, the real control is
// visually dimmed and inert (`pointer-events-none`) and a transparent
// button sits on top intercepting the click — same size and position, just
// swapping "open the dropdown" for "prompt sign-up/upgrade".
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
    <div className={`relative ${className}`}>
      <div className="pointer-events-none opacity-50">{children}</div>
      <button
        type="button"
        onClick={onLockedClick}
        aria-label="Sign up for CongTrade Pro to use this filter"
        title="CongTrade Pro feature"
        className="absolute inset-0 flex cursor-pointer items-center justify-end rounded-md pr-3"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-faint" aria-hidden>
          <rect x="4" y="11" width="16" height="9" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
      </button>
    </div>
  );
}
