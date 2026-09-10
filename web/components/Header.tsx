import { ThemeToggle } from "./ThemeToggle";

// A U.S. Capitol dome — colonnade base, pediment, ringed dome, spire —
// rendered in the page's own ink color (currentColor) rather than the
// accent, since the wordmark next to it carries the accent color instead
// (see Header below). Stays legible down to a 28px mark (checked by
// rasterizing before wiring it in). Same mark also backs app/icon.svg for
// the browser tab, which can't read currentColor and hardcodes its own
// light/dark colors instead.
function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <circle cx="12" cy="2.6" r="0.9" fill="currentColor" />
      <line x1="12" y1="3.6" x2="12" y2="6.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <path
        d="M6.3 13.8C6.3 9.2 8.7 5.4 12 5.4C15.3 5.4 17.7 9.2 17.7 13.8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path d="M8 11.6C9.1 10.8 10.5 10.3 12 10.3C13.5 10.3 14.9 10.8 16 11.6" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
      <rect x="9" y="13.6" width="6" height="2.6" rx="0.3" fill="currentColor" />
      <path d="M4.4 17.8L12 14.2L19.6 17.8Z" fill="currentColor" />
      <rect x="3.2" y="17.8" width="1.5" height="3.6" fill="currentColor" />
      <rect x="6.1" y="17.8" width="1.5" height="3.6" fill="currentColor" />
      <rect x="9" y="17.8" width="1.5" height="3.6" fill="currentColor" />
      <rect x="11.9" y="17.8" width="1.5" height="3.6" fill="currentColor" />
      <rect x="14.8" y="17.8" width="1.5" height="3.6" fill="currentColor" />
      <rect x="17.7" y="17.8" width="1.5" height="3.6" fill="currentColor" />
      <rect x="2" y="21.4" width="20" height="1.7" rx="0.4" fill="currentColor" />
    </svg>
  );
}

export function Header() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-7xl items-start justify-between px-4 py-3 sm:px-6">
        {/* flex-wrap lets the tagline ride next to the wordmark whenever
            there's room, and only fall to its own line once the row
            actually can't fit it — no breakpoint guessing. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <div className="flex items-center gap-3">
            <div className="text-ink">
              <Logo />
            </div>
            <span className="text-xl font-bold tracking-tight sm:text-2xl">
              <span className="text-ink">Cong</span>
              <span className="text-accent">Trade</span>
            </span>
          </div>
          <span className="flex items-center gap-3 whitespace-nowrap border-l border-line pl-3">
            <span className="text-[11px] font-medium uppercase tracking-wider text-ink-faint">Track Congress trades</span>
          </span>
        </div>
        <div className="flex items-center gap-2 py-0.5">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
