import { ThemeToggle } from "./ThemeToggle";

// A U.S. Capitol dome — colonnade base, pediment, ringed dome, spire —
// rendered as flat theme-accent shapes so it adapts to light/dark mode the
// same way every other icon in this app does (rgb(var(--accent))), and
// stays legible down to a 32px header badge. Same mark also backs
// app/icon.svg for the browser tab.
function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <circle cx="12" cy="2.6" r="0.9" fill="rgb(var(--accent))" />
      <line x1="12" y1="3.6" x2="12" y2="6.4" stroke="rgb(var(--accent))" strokeWidth="1.3" strokeLinecap="round" />
      <path
        d="M6.3 13.8C6.3 9.2 8.7 5.4 12 5.4C15.3 5.4 17.7 9.2 17.7 13.8"
        stroke="rgb(var(--accent))"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path d="M8 11.6C9.1 10.8 10.5 10.3 12 10.3C13.5 10.3 14.9 10.8 16 11.6" stroke="rgb(var(--accent))" strokeWidth="1.1" strokeLinecap="round" />
      <rect x="9" y="13.6" width="6" height="2.6" rx="0.3" fill="rgb(var(--accent))" />
      <path d="M4.4 17.8L12 14.2L19.6 17.8Z" fill="rgb(var(--accent))" />
      <rect x="3.2" y="17.8" width="1.5" height="3.6" fill="rgb(var(--accent))" />
      <rect x="6.1" y="17.8" width="1.5" height="3.6" fill="rgb(var(--accent))" />
      <rect x="9" y="17.8" width="1.5" height="3.6" fill="rgb(var(--accent))" />
      <rect x="11.9" y="17.8" width="1.5" height="3.6" fill="rgb(var(--accent))" />
      <rect x="14.8" y="17.8" width="1.5" height="3.6" fill="rgb(var(--accent))" />
      <rect x="17.7" y="17.8" width="1.5" height="3.6" fill="rgb(var(--accent))" />
      <rect x="2" y="21.4" width="20" height="1.7" rx="0.4" fill="rgb(var(--accent))" />
    </svg>
  );
}

export function Header() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/15">
            <Logo />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight sm:text-base">CongTrade</div>
            <div className="hidden text-[11px] text-ink-faint sm:block">Congress Trade Tracker</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
